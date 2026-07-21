/**
 * Unattended organise pass: find downloads qBittorrent has finished, plan them,
 * and carry the plans out — the same plan/execute pipeline the review modal
 * drives, minus the human.
 */

import { db } from "@/db";
import { download } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { syncDownloadStatuses } from "./sync";
import { planFolder } from "./plan";
import { executePlans } from "./execute";
import { isPlan } from "./types";

/** One retry covers a torrent qBittorrent was still moving; beyond that the
 *  plan itself is usually wrong and re-planning just burns tokens. */
export const MAX_ORGANIZE_ATTEMPTS = 2;

/** Statuses a sweep is willing to pick up */
const ELIGIBLE = ["completed", "failed"];

export interface SweepResult {
  claimed: number;
  organized: number;
  failed: number;
  skipped: number;
}

interface Claimable {
  id: string;
  folderName: string;
}

/**
 * Move eligible rows to "organizing" and return them.
 *
 * The status write is the lock: a second sweep starting mid-run sees
 * "organizing" rather than "completed" and leaves them alone. Claiming happens
 * in one transaction so an overlapping sweep cannot interleave between the read
 * and the write.
 */
function claimPending(): { claimed: Claimable[]; skipped: number } {
  return db.transaction((tx) => {
    const candidates = tx
      .select()
      .from(download)
      .where(inArray(download.status, ELIGIBLE))
      .all();

    // Skipped are those out of retries, plus any with no on-disk name to plan from
    const eligible = candidates.filter(
      (d) => d.organizeAttempts < MAX_ORGANIZE_ATTEMPTS && (d.torrentName || d.originalPath)
    );

    const now = new Date();
    for (const d of eligible) {
      tx.update(download)
        .set({
          status: "organizing",
          organizeAttempts: d.organizeAttempts + 1,
          updatedAt: now,
        })
        .where(eq(download.id, d.id))
        .run();
    }

    return {
      claimed: eligible.map((d) => ({
        id: d.id,
        // originalPath is the full path; the planner wants the entry name
        folderName: d.torrentName ?? d.originalPath!.split("/").filter(Boolean).pop()!,
      })),
      skipped: candidates.length - eligible.length,
    };
  });
}

function markFailed(id: string, error: string): void {
  db.update(download)
    .set({ status: "failed", errorMessage: error, updatedAt: new Date() })
    .where(eq(download.id, id))
    .run();
}

/** executePlans already does this for tracked rows, but the sweep owns the
 *  terminal state of what it claimed rather than relying on that side effect. */
function markOrganized(id: string, destination?: string): void {
  db.update(download)
    .set({ status: "organized", destinationPath: destination, errorMessage: null, updatedAt: new Date() })
    .where(eq(download.id, id))
    .run();
}

/**
 * Run one pass. Safe to call concurrently — claiming is what prevents two
 * sweeps organising the same download.
 */
export async function runAutoOrganize(
  log: (message: string) => void = () => {}
): Promise<SweepResult> {
  await syncDownloadStatuses();

  const { claimed, skipped } = claimPending();
  if (claimed.length === 0) return { claimed: 0, organized: 0, failed: 0, skipped };

  log(`Organising ${claimed.length} completed download(s)`);

  let organized = 0;
  let failed = 0;

  for (const item of claimed) {
    const result = await planFolder({ folderName: item.folderName, downloadId: item.id });

    if (!isPlan(result)) {
      log(`Plan failed for ${item.folderName}: ${result.error}`);
      markFailed(item.id, result.error);
      failed++;
      continue;
    }

    if (result.operations.length === 0) {
      const error = "Plan contained no files to copy";
      log(`${item.folderName}: ${error}`);
      markFailed(item.id, error);
      failed++;
      continue;
    }

    try {
      // Merge, never replace: seasons and episodes of one show arrive across
      // separate downloads, and wiping the folder would delete the ones
      // already filed.
      const [outcome] = await executePlans(
        [result],
        (event, data) => {
          if (event === "log" && (data.action === "MERGE" || data.action === "REPLACE")) {
            log(String(data.detail));
          }
        },
        { mode: "merge" }
      );

      if (outcome.error || outcome.copied === 0) {
        const error = outcome.error ?? "No files were copied";
        markFailed(item.id, error);
        log(`${item.folderName}: ${error}`);
        failed++;
      } else {
        markOrganized(item.id, outcome.destination);
        log(`${item.folderName} → ${outcome.destination} (${outcome.copied} file(s))`);
        organized++;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      markFailed(item.id, error);
      log(`${item.folderName}: ${error}`);
      failed++;
    }
  }

  return { claimed: claimed.length, organized, failed, skipped };
}
