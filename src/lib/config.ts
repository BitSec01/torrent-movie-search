/**
 * Deployment-specific locations. Read from env on every call rather than
 * captured at import time so tests (and a future multi-host setup) can vary
 * them without reloading modules.
 */

const DEFAULT_STORAGE_ROOT = "/mnt/storage";

// ThePirateBay mirrors rotate hosts and 301 the old ones; override via env when
// the current mirror dies rather than editing the scraper.
const DEFAULT_TPB_BASE = "https://www3.thepiratebay3.to";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function storageRoot(): string {
  return trimTrailingSlash(process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT);
}

export function moviesDir(): string {
  return `${storageRoot()}/Movies`;
}

export function seriesDir(): string {
  return `${storageRoot()}/Series`;
}

export function torrentsDir(): string {
  return `${storageRoot()}/torrents`;
}

export function tpbBase(): string {
  return trimTrailingSlash(process.env.TPB_BASE || DEFAULT_TPB_BASE);
}

/** TMDB is the primary metadata source: posters, plots, cast, certifications
 *  and TV coverage, with no daily request cap. Empty only in a deployment that
 *  has deliberately fallen back to an OMDb-compatible host. */
export function tmdbApiKey(): string {
  return (process.env.TMDB_API_KEY || "").trim();
}

/** OMDb is optional and additive — it contributes the Rotten Tomatoes and
 *  Metacritic scores, awards and box office that TMDB has no equivalent for.
 *  Empty means every OMDb lookup is skipped rather than failing. */
export function omdbApiKey(): string {
  return (process.env.OMDB_API_KEY || "").trim();
}

// Any host speaking OMDb's request/response shape can stand in here — the point
// of the override is to repoint at a self-hosted OMDb-compatible API without
// touching the client.
const DEFAULT_OMDB_BASE = "https://www.omdbapi.com";

export function omdbBase(): string {
  return trimTrailingSlash(process.env.OMDB_BASE_URL || DEFAULT_OMDB_BASE);
}

/** Destination for a download, by content kind. Series land in the torrents
 *  staging dir because they still need organising into Season folders. */
export function savePathFor(contentType: "movie" | "series"): string {
  return contentType === "movie" ? moviesDir() : torrentsDir();
}

/**
 * The chat agent loops up to MAX_STEPS per message, so its per-token price is
 * multiplied by roughly an order of magnitude — it dominates the API bill and
 * wants the cheapest model that can still pick the right torrent.
 */
export function chatModel(): string {
  return process.env.CHAT_MODEL || "gpt-5.4-nano";
}

/**
 * The organiser runs once per completed download and names files that land in
 * the real library, so it is cheap in aggregate and worth more capability.
 */
export function organizeModel(): string {
  return process.env.ORGANIZE_MODEL || "gpt-5.4-mini";
}
