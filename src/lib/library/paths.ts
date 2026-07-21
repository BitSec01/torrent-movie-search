import { storageRoot } from "@/lib/config";

const STORAGE_ROOT = storageRoot();

/** Every filesystem operation in the organiser goes through here — nothing is
 *  allowed to address anything outside the media root. */
export function sanitizePath(p: string): string {
  const resolved = p.replace(/\/+/g, "/").replace(/\.\./g, "");
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error("Path outside allowed storage root");
  }
  return resolved;
}

export function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
