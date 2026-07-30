import type { TorrentLink, UnifiedSearchResult } from "./types";

/** Strip punctuation & collapse whitespace for fuzzy title matching */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Torrent names carry release metadata a title never has ("2160p WEB-DL"), so
 * matching is containment in either direction against the name up to the first
 * bracket, which is where that metadata usually starts.
 */
export function attachTorrentLinks(
  results: UnifiedSearchResult[],
  torrents: TorrentLink[]
): UnifiedSearchResult[] {
  for (const movie of results) {
    const movieTitle = norm(movie.title);
    const matching = torrents.filter((t) => {
      const tTitle = norm(t.title);
      const tBase = norm(t.title.split(/\s*[([{]/)[0] ?? "");
      return tTitle.includes(movieTitle) || movieTitle.includes(tBase);
    });
    if (matching.length > 0) {
      matching.sort((a, b) => b.seeds - a.seeds);
      movie.torrentLinks = matching;
    }
  }
  return results;
}
