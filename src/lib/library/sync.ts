/**
 * Reconciles the download table with what qBittorrent actually reports.
 * Runs both from the library page poll and from the unattended sweep.
 */

import { db } from "@/db";
import { download } from "@/db/schema";
import { eq, and, or, lt, isNull, inArray } from "drizzle-orm";
import { getTorrentsInfo } from "@/lib/api/qbittorrent";
import { lookupTitleMetadata } from "@/lib/api/metadata";
import { MetadataSourceError } from "@/lib/api/errors";

const COMPLETE_STATES = ["uploading", "stalledUP", "forcedUP", "pausedUP"];

export interface SyncResult {
  checked: number;
  updated: number;
  removed: number;
  enriched: number;
}

/**
 * Drop tracked downloads whose torrent no longer exists in qBittorrent.
 * "organized" rows are kept — they live at a destination path independent of
 * the torrent, so the user removes those explicitly.
 */
function removeOrphans(qbtHashes: Set<string>): number {
  const orphanedIds = db
    .select()
    .from(download)
    .all()
    .filter((d) => d.status !== "organized" && !qbtHashes.has(d.hash.toLowerCase()))
    .map((d) => d.id);

  if (orphanedIds.length === 0) return 0;

  const result = db.delete(download).where(inArray(download.id, orphanedIds)).run();
  return result.changes ?? orphanedIds.length;
}

/**
 * A title no source can match never becomes enriched, so selecting "everything
 * still missing" re-asks for the same dead titles on every sweep. At one sweep
 * per five minutes that is ~288 lookups per stuck row per day, which a metered
 * source cannot absorb and which is pointless work even against one that can.
 */
export const MAX_METADATA_ATTEMPTS = 3;
export const ENRICH_BATCH = 10;

async function enrichMissingMetadata(): Promise<number> {
  const unenriched = db
    .select()
    .from(download)
    .where(
      and(
        or(isNull(download.poster), isNull(download.imdbId)),
        lt(download.metadataAttempts, MAX_METADATA_ATTEMPTS)
      )
    )
    .limit(ENRICH_BATCH)
    .all();

  let enriched = 0;
  for (const d of unenriched) {
    try {
      const match = await lookupTitleMetadata(d.title, {
        year: d.year,
        type: d.type === "series" ? "series" : "movie",
      });

      if (match) {
        const newImdbId = !d.imdbId && match.imdbId ? match.imdbId : d.imdbId;
        const newPoster = !d.poster && match.poster ? match.poster : d.poster;
        const newYear = !d.year && match.year ? match.year : d.year;
        if (newImdbId !== d.imdbId || newPoster !== d.poster || newYear !== d.year) {
          db.update(download)
            .set({ imdbId: newImdbId, poster: newPoster, year: newYear, updatedAt: new Date() })
            .where(eq(download.id, d.id))
            .run();
          enriched++;
        }
      } else {
        // The sources answered and had nothing, so this row is a little closer
        // to being retired. Only a real answer counts against the budget.
        db.update(download)
          .set({ metadataAttempts: d.metadataAttempts + 1 })
          .where(eq(download.id, d.id))
          .run();
      }
    } catch (err) {
      // A bad key or an exhausted quota fails identically for every row, so the
      // rest of the batch would only buy the same 401 nine more times.
      if (err instanceof MetadataSourceError) {
        console.error("[Sync] metadata source unavailable, abandoning enrichment:", err.message);
        break;
      }
    }
  }
  return enriched;
}

export async function syncDownloadStatuses(): Promise<SyncResult> {
  const allTorrents = await getTorrentsInfo();
  const qbtHashes = new Set(allTorrents.map((t) => t.hash.toLowerCase()));

  const removed = removeOrphans(qbtHashes);

  const pending = db.select().from(download).where(eq(download.status, "downloading")).all();

  const now = new Date();
  let updated = 0;

  for (const d of pending) {
    const info = allTorrents.find((t) => t.hash.toLowerCase() === d.hash.toLowerCase());
    if (!info) continue;

    const originalPath = `${info.save_path}/${info.name}`.replace(/\/\//g, "/");
    const isComplete = info.progress >= 1 || COMPLETE_STATES.includes(info.state);

    if (isComplete) {
      db.update(download)
        .set({ status: "completed", torrentName: info.name, originalPath, updatedAt: now })
        .where(eq(download.id, d.id))
        .run();
      updated++;
    } else if (!d.torrentName && info.name) {
      db.update(download)
        .set({ torrentName: info.name, originalPath, updatedAt: now })
        .where(eq(download.id, d.id))
        .run();
    }
  }

  return { checked: pending.length, updated, removed, enriched: await enrichMissingMetadata() };
}
