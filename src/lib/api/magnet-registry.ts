/**
 * Maps torrent info hashes back to the full magnet URIs they came from.
 *
 * Magnet URIs are ~1KB each, and ~90% of that is the tracker list. Sending them
 * through the model's context is what pushes the chat route into OpenAI's TPM
 * limit, so tools hand the model a 40-char info hash and resolve it back here
 * when it asks for a download. Trackers are preserved on the round trip, which
 * a hash-only magnet would lose.
 */

import { extractHash } from "./qbittorrent";

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;

interface Entry {
  magnet: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();

function now(): number {
  return Date.now();
}

function evictExpired(): void {
  const t = now();
  for (const [hash, entry] of store) {
    if (entry.expiresAt <= t) store.delete(hash);
  }
}

/**
 * Store a magnet and return its info hash for the model to reference.
 * Returns null when the URI carries no usable hash.
 */
export function rememberMagnet(magnet: string): string | null {
  const hash = extractHash(magnet);
  if (!hash) return null;

  // Re-inserting moves the key to the end, which keeps the eviction below
  // ordered oldest-first.
  store.delete(hash);
  store.set(hash, { magnet, expiresAt: now() + TTL_MS });

  if (store.size > MAX_ENTRIES) {
    evictExpired();
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next();
      if (oldest.done) break;
      store.delete(oldest.value);
    }
  }

  return hash;
}

/**
 * Recover the full magnet for a hash the model referenced.
 *
 * Falls back to a minimal trackerless magnet when the entry has expired or the
 * process restarted mid-conversation: peer discovery then relies on DHT alone,
 * which is slower but still resolves rather than failing the download outright.
 */
export function resolveMagnet(reference: string, displayName?: string): string | null {
  const hash = extractHash(reference) ?? normaliseHash(reference);
  if (!hash) return null;

  const entry = store.get(hash);
  if (entry && entry.expiresAt > now()) return entry.magnet;
  if (entry) store.delete(hash);

  const suffix = displayName ? `&dn=${encodeURIComponent(displayName)}` : "";
  return `magnet:?xt=urn:btih:${hash}${suffix}`;
}

/** Accept a bare info hash (40-char hex or 32-char base32) with no magnet wrapper */
function normaliseHash(value: string): string | null {
  const trimmed = value.trim();
  return /^([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Test seam — the store is module-level and would otherwise leak between cases */
export function clearMagnetRegistry(): void {
  store.clear();
}
