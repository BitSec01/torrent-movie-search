/**
 * qBittorrent Web API client.
 * Handles authentication and adding torrents via magnet links.
 * See: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
 */

import { torrentsDir } from "@/lib/config";

const DEFAULT_SAVE_PATH = torrentsDir();

export interface QbtTorrentInfo {
  hash: string;
  name: string;
  state: string; // downloading, uploading, pausedDL, pausedUP, stalledDL, stalledUP, error, missingFiles, etc.
  progress: number; // 0.0 – 1.0
  dlspeed: number;
  upspeed: number;
  num_seeds: number;
  num_leechs: number;
  eta: number; // seconds, 8640000 = infinity
  size: number;
  save_path: string;
}

/** Extract the info hash (btih) from a magnet URI */
export function extractHash(magnet: string): string | null {
  const match = magnet.match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  return match ? match[1].toLowerCase() : null;
}

function getConfig() {
  const host = process.env.QBITTORRENT_HOST;
  const username = process.env.QBITTORRENT_USERNAME || "admin";
  const password = process.env.QBITTORRENT_PASSWORD || "";

  if (!host) throw new Error("QBITTORRENT_HOST is not set");
  return { host: host.replace(/\/$/, ""), username, password };
}

/** The whole `name=value` pair, because the name is version-dependent. */
let cachedCookie: string | null = null;

/**
 * 4.x names the session cookie `SID`; 5.x names it `QBT_SID_<port>`. Matching on
 * a bare `SID=` finds neither in 5.x, so the pair is taken whole and replayed
 * verbatim.
 */
function sessionCookie(res: Response): string | null {
  for (const header of res.headers.getSetCookie()) {
    const pair = header.split(";")[0]?.trim();
    if (pair && /^(QBT_)?SID(_\d+)?=/i.test(pair)) return pair;
  }
  return null;
}

/** Authenticate with qBittorrent and get the session cookie */
async function login(): Promise<string> {
  const { host, username, password } = getConfig();

  const res = await fetch(`${host}/api/v2/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // 4.x refuses a login whose Referer is not the WebUI's own origin.
      Referer: host,
    },
    body: new URLSearchParams({ username, password }).toString(),
  });

  if (!res.ok) throw new Error(`qBittorrent auth failed: HTTP ${res.status}`);

  // 4.x answers "Ok." or "Fails."; 5.x answers 204 with an empty body, so an
  // empty body is success there and must not be read as a rejection.
  const body = (await res.text()).trim();
  if (body === "Fails.") {
    throw new Error(
      "qBittorrent rejected the credentials — check QBITTORRENT_USERNAME and QBITTORRENT_PASSWORD"
    );
  }

  const cookie = sessionCookie(res);
  if (!cookie) throw new Error("qBittorrent auth: no session cookie returned");

  // 5.x issues a cookie for wrong credentials as readily as for right ones, so
  // holding one proves nothing. Only an authenticated endpoint separates the
  // two, and asking here turns a silent 403 loop into one clear error.
  const probe = await fetch(`${host}/api/v2/app/version`, { headers: { Cookie: cookie } });
  if (probe.status === 403) {
    throw new Error(
      "qBittorrent rejected the credentials — check QBITTORRENT_USERNAME and QBITTORRENT_PASSWORD"
    );
  }

  cachedCookie = cookie;
  return cookie;
}

/** Get a valid session cookie, re-authenticating if needed */
async function getCookie(): Promise<string> {
  if (cachedCookie) {
    const { host } = getConfig();
    const res = await fetch(`${host}/api/v2/app/version`, {
      headers: { Cookie: cachedCookie },
    });
    if (res.ok) return cachedCookie;
    cachedCookie = null;
  }
  return login();
}

/** Add a torrent via magnet link to qBittorrent */
export async function addTorrent(
  magnet: string,
  savePath = DEFAULT_SAVE_PATH
): Promise<{ success: boolean; message: string }> {
  const cookie = await getCookie();
  const { host } = getConfig();

  const formData = new URLSearchParams({
    urls: magnet,
    savepath: savePath,
  });

  const res = await fetch(`${host}/api/v2/torrents/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body: formData.toString(),
  });

  // 5.x answers an add for a torrent it already holds with 409. Asking for
  // something already queued is not a failure worth showing as one.
  if (res.status === 409) return { success: true, message: "Already in qBittorrent" };

  if (!res.ok) {
    // If 403, try re-auth once
    if (res.status === 403) {
      cachedCookie = null;
      const newCookie = await login();
      const retryRes = await fetch(`${host}/api/v2/torrents/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: newCookie,
        },
        body: formData.toString(),
      });
      if (retryRes.status === 409) return { success: true, message: "Already in qBittorrent" };
      if (!retryRes.ok) {
        return { success: false, message: `qBittorrent returned HTTP ${retryRes.status}` };
      }
      return { success: true, message: "Torrent added to qBittorrent" };
    }
    return { success: false, message: `qBittorrent returned HTTP ${res.status}` };
  }

  // A magnet qBittorrent declines still comes back 200 — the refusal is in the
  // body, so a 200 alone is not proof the torrent was queued.
  const body = (await res.text()).trim();
  if (body === "Fails.") {
    return { success: false, message: "qBittorrent refused the magnet link" };
  }

  return { success: true, message: "Torrent added to qBittorrent" };
}

/** Query qBittorrent for torrent info — all torrents or filtered by hashes */
export async function getTorrentsInfo(
  hashes?: string[]
): Promise<QbtTorrentInfo[]> {
  const cookie = await getCookie();
  const { host } = getConfig();

  const params = new URLSearchParams();
  if (hashes && hashes.length > 0) {
    params.set("hashes", hashes.join("|"));
  }

  const url = `${host}/api/v2/torrents/info${params.toString() ? `?${params}` : ""}`;

  const res = await fetch(url, {
    headers: { Cookie: cookie },
  });

  if (!res.ok) {
    if (res.status === 403) {
      cachedCookie = null;
      const newCookie = await login();
      const retryRes = await fetch(url, {
        headers: { Cookie: newCookie },
      });
      if (!retryRes.ok) return [];
      return retryRes.json();
    }
    return [];
  }

  return res.json();
}
