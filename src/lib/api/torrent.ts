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

    const torrents = await Promise.all(results.map(async (r) => {
      // Try to get magnet link — race against a 3s timeout so one slow provider can't stall the rest
      let magnet: string | undefined;
      try {
        magnet = await Promise.race([
          TorrentSearchApi.getMagnet(r),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]);
      } catch {
        // Some providers may fail or timeout
      }

      // The runtime torrent objects have seeds/peers/link but the type defs are incomplete
      const raw = r as unknown as Record<string, unknown>;
      return {
        title: r.title ?? "",
        provider: r.provider ?? "",
        seeds: Number(raw.seeds) || 0,
        peers: Number(raw.peers) || 0,
        size: r.size ?? "",
        magnet: magnet || undefined,
        link: (raw.link as string) || r.desc || undefined,
      } satisfies TorrentLink;
    }));

    return torrents;
  } catch (err) {
    console.error("[Torrent] search error:", err);
    return [];
  }
}
