/**
 * Deterministically carries out copy plans produced by plan.ts.
 *
 * No model is involved past this point: destinations are constrained to the
 * Movies/Series roots, sources are only ever read, and the original torrent
 * folder is left in place so seeding continues.
 */

import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exec } from "child_process";
import { promisify } from "util";
import path from "node:path";
import { moviesDir, seriesDir, torrentsDir } from "@/lib/config";
import { sanitizePath, shellEscape } from "./paths";
import type { ExecuteEvent, ExecuteMode, FolderOutcome, FolderPlan } from "./types";
import { createReadStream, createWriteStream, readdirSync, statSync, statfsSync } from "fs";

export type { ExecuteMode };

const execAsync = promisify(exec);

const MOVIES_DIR = moviesDir();
const SERIES_DIR = seriesDir();
const TORRENTS_DIR = torrentsDir();

type Emit = (event: ExecuteEvent["event"], data: Record<string, unknown>) => void;

export interface ExecuteOptions {
  mode?: ExecuteMode;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await execAsync(`test -e ${shellEscape(p)}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies a file, reporting progress.
 *
 * Streams it rather than shelling out to rsync. rsync is not present in a slim container image
 * — and the old fallback to `cp` could not save it: when spawn fails with ENOENT Node emits
 * *both* `error` and `close`, and the `close` handler rejected before the asynchronous fallback
 * had finished. The copy therefore succeeded on disk while being reported as a failure, which
 * is the worst of both outcomes: the file is there and the app believes it is not, so it
 * retries and counts attempts against it forever.
 *
 * A stream copy has no external dependency, works identically everywhere, and still gives a
 * byte-accurate percentage instead of parsing another program's output.
 */
function copyFileWithProgress(
  src: string,
  dst: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let total = 0;
    try {
      total = statSync(src).size;
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const read = createReadStream(src);
    const write = createWriteStream(dst);
    let copiedBytes = 0;

    read.on("data", (chunk) => {
      copiedBytes += chunk.length;
      // A zero-length file is legitimately 100% done the moment it is created.
      onProgress(total > 0 ? Math.min(100, Math.round((copiedBytes / total) * 100)) : 100);
    });

    read.on("error", finish);
    write.on("error", finish);
    write.on("close", () => finish());

    read.pipe(write);
  });
}

function formatSize(bytes: number): string {
  if (bytes > 1_073_741_824) return ` (${(bytes / 1_073_741_824).toFixed(1)} GB)`;
  if (bytes > 1_048_576) return ` (${(bytes / 1_048_576).toFixed(0)} MB)`;
  return ` (${(bytes / 1024).toFixed(0)} KB)`;
}

/** Total size of a directory tree, in bytes. */
function directorySize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // Not followed: a symlink's target may be outside the tree, or counted twice.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += directorySize(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

/**
 * Refuses a copy that would not fit.
 *
 * Measured with Node's own calls rather than `du -sb` and `df --output=avail`. Both of those
 * flags are GNU coreutils; busybox has neither, so in an Alpine-based container the whole check
 * threw and was swallowed by the catch below — silently disabling the one guard standing between
 * a 60 GB copy and a full disk. The failure mode was invisible precisely because it was
 * non-fatal by design.
 */
async function hasEnoughSpace(folderName: string, destinationBase: string): Promise<string | null> {
  try {
    const sourceDir = sanitizePath(`${TORRENTS_DIR}/${folderName}`);
    const sourceBytes = directorySize(sourceDir);

    const fsStats = statfsSync(destinationBase);
    const availBytes = fsStats.bavail * fsStats.bsize;

    if (sourceBytes > availBytes) {
      return `Insufficient space: need ${(sourceBytes / 1e9).toFixed(1)} GB, have ${(availBytes / 1e9).toFixed(1)} GB`;
    }
  } catch {
    // Non-fatal: a source that cannot be measured is caught later by the copy itself.
  }
  return null;
}

async function executePlan(plan: FolderPlan, emit: Emit, fallbackMode: ExecuteMode): Promise<FolderOutcome> {
  const { folderName, downloadId, rootFolder, destinationBase, operations } = plan;
  const mode = plan.mode ?? fallbackMode;
  const base: FolderOutcome = { folderName, downloadId, copied: 0, failed: 0 };

  let destRoot: string;
  try {
    destRoot = sanitizePath(`${destinationBase}/${rootFolder}`);
  } catch {
    emit("log", { folderName, action: "ERROR", detail: "Invalid destination path" });
    emit("folder-error", { folderName, error: "Invalid destination path" });
    return { ...base, error: "Invalid destination path" };
  }

  if (!destRoot.startsWith(MOVIES_DIR + "/") && !destRoot.startsWith(SERIES_DIR + "/")) {
    const error = "Destination outside allowed directories";
    emit("log", { folderName, action: "ERROR", detail: `Destination not in Movies/ or Series/` });
    emit("folder-error", { folderName, error });
    return { ...base, error };
  }

  emit("log", { folderName, action: "START", detail: `→ ${destRoot}` });

  const spaceError = await hasEnoughSpace(folderName, destinationBase);
  if (spaceError) {
    emit("log", { folderName, action: "ERROR", detail: spaceError });
    emit("folder-error", { folderName, error: spaceError });
    return { ...base, error: spaceError };
  }
  emit("log", { folderName, action: "INFO", detail: "Disk space OK" });

  const destExisted = await pathExists(destRoot);

  if (mode === "replace") {
    // Logged explicitly because this discards whatever was already filed here
    if (destExisted) {
      emit("log", {
        folderName,
        action: "OVERWRITE",
        detail: `Replacing existing contents of ${destRoot}`,
      });
    }
    try {
      await execAsync(`rm -rf ${shellEscape(destRoot)}`);
    } catch {
      // Already gone or never existed
    }
  } else if (destExisted) {
    emit("log", { folderName, action: "MERGE", detail: `Adding to existing ${destRoot}` });
  }

  const dirs = new Set([destRoot]);
  for (const op of operations) {
    dirs.add(path.dirname(path.join(destRoot, op.destRelPath)));
  }
  for (const dir of [...dirs]) {
    try {
      await execAsync(`mkdir -p ${shellEscape(dir)}`);
    } catch (e) {
      emit("log", {
        folderName,
        action: "ERROR",
        detail: `mkdir failed: ${e instanceof Error ? e.message : e}`,
      });
    }
  }
  emit("log", { folderName, action: "MKDIR", detail: "Directory structure created" });

  let copied = 0;
  let failed = 0;

  for (const op of operations) {
    let safeSrc: string;
    let safeDst: string;
    try {
      safeSrc = sanitizePath(op.sourceAbsPath);
      safeDst = sanitizePath(path.join(destRoot, op.destRelPath));
    } catch {
      emit("log", { folderName, action: "ERROR", detail: "Skipped: invalid path in operation" });
      failed++;
      continue;
    }

    const fileName = path.basename(safeDst);

    let sizeLabel = "";
    try {
      const { stdout } = await execAsync(`stat -c%s ${shellEscape(safeSrc)}`);
      sizeLabel = formatSize(parseInt(stdout.trim(), 10));
    } catch {
      // ignore
    }

    const replacing = mode === "merge" && (await pathExists(safeDst));
    emit("log", {
      folderName,
      action: replacing ? "REPLACE" : "COPY",
      detail: `${fileName}${sizeLabel}`,
    });

    try {
      let lastPct = -1;
      await copyFileWithProgress(safeSrc, safeDst, (pct) => {
        const rounded = Math.floor(pct / 10) * 10;
        if (rounded > lastPct) {
          lastPct = rounded;
          emit("progress", { folderName, fileName, pct });
        }
      });
      emit("log", { folderName, action: "DONE", detail: fileName });
      copied++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emit("log", { folderName, action: "ERROR", detail: `${fileName}: ${msg}` });
      failed++;
    }
  }

  if (downloadId) {
    db.update(download)
      .set({ status: "organized", destinationPath: destRoot, updatedAt: new Date() })
      .where(eq(download.id, downloadId))
      .run();
  }

  emit("folder-complete", { folderName, destination: destRoot, copied, failed });
  return { ...base, destination: destRoot, copied, failed };
}

export async function executePlans(
  plans: FolderPlan[],
  emit: Emit = () => {},
  // Merge by default: replacing destroys whatever was filed there previously,
  // so it has to be an explicit choice rather than something a caller gets by
  // forgetting to pass an option.
  { mode = "merge" }: ExecuteOptions = {}
): Promise<FolderOutcome[]> {
  const outcomes: FolderOutcome[] = [];
  for (const plan of plans) {
    outcomes.push(await executePlan(plan, emit, mode));
  }
  emit("complete", { organized: plans.length });
  return outcomes;
}
