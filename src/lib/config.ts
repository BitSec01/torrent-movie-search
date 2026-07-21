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

/** Destination for a download, by content kind. Series land in the torrents
 *  staging dir because they still need organising into Season folders. */
export function savePathFor(contentType: "movie" | "series"): string {
  return contentType === "movie" ? moviesDir() : torrentsDir();
}
