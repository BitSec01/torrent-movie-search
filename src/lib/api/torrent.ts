import TorrentSearchApi from "torrent-search-api";
import type { TorrentLink } from "./types";

let initialized = false;

const DEFAULT_PROVIDERS = ["1337x", "ThePirateBay", "Yts", "Limetorrents", "Eztv"];

function ensureInitialized() {
  if (initialized) return;
  for (const provider of DEFAULT_PROVIDERS) {
    try {
      TorrentSearchApi.enableProvider(provider);
    } catch {
      console.warn(`[Torrent] Failed to enable provider: ${provider}`);
    }
  }
  initialized = true;
}

export async function searchTorrents(
  query: string,
  category = "All",
  limit = 5
): Promise<TorrentLink[]> {
  ensureInitialized();

  try {
    const results = await TorrentSearchApi.search(query, category, limit);

    const torrents: TorrentLink[] = [];
    for (const r of results) {
      // Try to get magnet link for each result
      let magnet: string | undefined;
      try {
        magnet = await TorrentSearchApi.getMagnet(r);
      } catch {
        // Some providers may fail to get magnet
      }

      // The runtime torrent objects have seeds/peers/link but the type defs are incomplete
      const raw = r as unknown as Record<string, unknown>;
      torrents.push({
        title: r.title ?? "",
        provider: r.provider ?? "",
        seeds: Number(raw.seeds) || 0,
        peers: Number(raw.peers) || 0,
        size: r.size ?? "",
        magnet: magnet || undefined,
        link: (raw.link as string) || r.desc || undefined,
      });
    }

    return torrents;
  } catch (err) {
    console.error("[Torrent] search error:", err);
    return [];
  }
}
