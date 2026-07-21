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

let cachedSID: string | null = null;

/** Authenticate with qBittorrent and get SID cookie */
async function login(): Promise<string> {
  const { host, username, password } = getConfig();

  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${host}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`qBittorrent auth failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  if (text.trim() !== "Ok.") {
    throw new Error(`qBittorrent auth rejected: ${text}`);
  }

  // Extract SID from Set-Cookie header
  const setCookie = res.headers.get("set-cookie") ?? "";
  const sidMatch = setCookie.match(/SID=([^;]+)/);
  if (!sidMatch) {
    throw new Error("qBittorrent auth: no SID cookie returned");
  }

  cachedSID = sidMatch[1];
  return cachedSID;
}

/** Get a valid SID, re-authenticating if needed */
async function getSID(): Promise<string> {
  if (cachedSID) {
    // Verify the SID is still valid
    const { host } = getConfig();
    const res = await fetch(`${host}/api/v2/app/version`, {
      headers: { Cookie: `SID=${cachedSID}` },
    });
    if (res.ok) return cachedSID;
    cachedSID = null;
  }
  return login();
}

/** Add a torrent via magnet link to qBittorrent */
export async function addTorrent(
  magnet: string,
  savePath = DEFAULT_SAVE_PATH
): Promise<{ success: boolean; message: string }> {
  const sid = await getSID();
  const { host } = getConfig();

  const formData = new URLSearchParams({
    urls: magnet,
    savepath: savePath,
  });

  const res = await fetch(`${host}/api/v2/torrents/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `SID=${sid}`,
    },
    body: formData.toString(),
  });

  if (!res.ok) {
    // If 403, try re-auth once
    if (res.status === 403) {
      cachedSID = null;
      const newSid = await login();
      const retryRes = await fetch(`${host}/api/v2/torrents/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `SID=${newSid}`,
        },
        body: formData.toString(),
      });
      if (!retryRes.ok) {
        return { success: false, message: `qBittorrent returned HTTP ${retryRes.status}` };
      }
      return { success: true, message: "Torrent added to qBittorrent" };
    }
    return { success: false, message: `qBittorrent returned HTTP ${res.status}` };
  }

  return { success: true, message: "Torrent added to qBittorrent" };
}

/** Query qBittorrent for torrent info — all torrents or filtered by hashes */
export async function getTorrentsInfo(
  hashes?: string[]
): Promise<QbtTorrentInfo[]> {
  const sid = await getSID();
  const { host } = getConfig();

  const params = new URLSearchParams();
  if (hashes && hashes.length > 0) {
    params.set("hashes", hashes.join("|"));
  }

  const url = `${host}/api/v2/torrents/info${params.toString() ? `?${params}` : ""}`;

  const res = await fetch(url, {
    headers: { Cookie: `SID=${sid}` },
  });

  if (!res.ok) {
    if (res.status === 403) {
      cachedSID = null;
      const newSid = await login();
      const retryRes = await fetch(url, {
        headers: { Cookie: `SID=${newSid}` },
      });
      if (!retryRes.ok) return [];
      return retryRes.json();
    }
    return [];
  }

  return res.json();
}
