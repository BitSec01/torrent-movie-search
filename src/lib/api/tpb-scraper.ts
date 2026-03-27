import { parse } from "node-html-parser";
import type { TorrentLink } from "./types";

const TPB_BASE = "https://www2.thepiratebay3.to";

/**
 * Scrape ThePirateBay search results page directly.
 * URL format: /s/{page}/{sortBy}/{order}?q=...&video=on&category=0
 *   sortBy=5 → seeders, order=0 → descending
 * Returns up to `limit` results sorted by highest seeders.
 */
export async function searchTPB(
  query: string,
  limit = 5
): Promise<TorrentLink[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      video: "on",
      category: "0",
    });
    const url = `${TPB_BASE}/s/0/5/0?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[TPB] HTTP ${res.status} for query "${query}"`);
      return [];
    }

    const html = await res.text();
    const root = parse(html);

    const table = root.querySelector("#searchResult");
    if (!table) {
      console.warn("[TPB] No #searchResult table found");
      return [];
    }

    const rows = table.querySelectorAll("tbody tr");
    const results: TorrentLink[] = [];

    for (const row of rows) {
      try {
        // Title from the .detLink anchor
        const titleEl = row.querySelector("a.detLink");
        const title = titleEl?.getAttribute("title")?.replace(/^Details for /, "") ?? titleEl?.text?.trim() ?? "";
        if (!title) continue;

        // Magnet link
        const magnetEl = row.querySelector('a[href^="magnet:"]');
        const magnet = magnetEl?.getAttribute("href") ?? undefined;

        // All <td> cells: [category, name, uploaded, magnet-td, size, SE, LE, uploader]
        const cells = row.querySelectorAll("td");
        if (cells.length < 7) continue;

        const size = cells[4]?.text?.trim() ?? "";
        const seeds = parseInt(cells[5]?.text?.trim() ?? "0", 10) || 0;
        const peers = parseInt(cells[6]?.text?.trim() ?? "0", 10) || 0;

        results.push({
          title,
          provider: "TPB",
          seeds,
          peers,
          size,
          magnet,
        });
      } catch {
        // Skip malformed rows
      }
    }

    // Already sorted by seeders from the URL, but ensure it + slice to limit
    results.sort((a, b) => b.seeds - a.seeds);
    return results.slice(0, limit);
  } catch (err) {
    console.error("[TPB] scrape error:", err);
    return [];
  }
}
