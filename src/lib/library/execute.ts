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
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "node:path";
import { moviesDir, seriesDir, torrentsDir } from "@/lib/config";
import { sanitizePath, shellEscape } from "./plan";
import type { ExecuteEvent, FolderOutcome, FolderPlan } from "./types";

const execAsync = promisify(exec);

const MOVIES_DIR = moviesDir();
const SERIES_DIR = seriesDir();
const TORRENTS_DIR = torrentsDir();

type Emit = (event: ExecuteEvent["event"], data: Record<string, unknown>) => void;

function copyFileWithProgress(
  src: string,
  dst: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("rsync", ["--progress", "--whole-file", src, dst]);
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const match = chunk.toString().match(/(\d+)%/);
      if (match) onProgress(parseInt(match[1], 10));
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `rsync exited ${code}`));
    });
    proc.on("error", () => {
      execAsync(`cp ${shellEscape(src)} ${shellEscape(dst)}`)
        .then(() => resolve())
        .catch(reject);
    });
  });
}

function formatSize(bytes: number): string {
  if (bytes > 1_073_741_824) return ` (${(bytes / 1_073_741_824).toFixed(1)} GB)`;
  if (bytes > 1_048_576) return ` (${(bytes / 1_048_576).toFixed(0)} MB)`;
  return ` (${(bytes / 1024).toFixed(0)} KB)`;
}

async function hasEnoughSpace(folderName: string, destinationBase: string): Promise<string | null> {
  try {
    const sourceDir = sanitizePath(`${TORRENTS_DIR}/${folderName}`);
    const { stdout: duOut } = await execAsync(`du -sb ${shellEscape(sourceDir)} 2>/dev/null`);
    const sourceBytes = parseInt(duOut.split("\t")[0], 10);
    const { stdout: dfOut } = await execAsync(
      `df --output=avail -B1 ${shellEscape(destinationBase)} 2>/dev/null | tail -1`
    );
    const availBytes = parseInt(dfOut.trim(), 10);

    if (!isNaN(sourceBytes) && !isNaN(availBytes) && sourceBytes > availBytes) {
      return `Insufficient space: need ${(sourceBytes / 1e9).toFixed(1)} GB, have ${(availBytes / 1e9).toFixed(1)} GB`;
    }
  } catch {
    // Non-fatal: proceed without the check
  }
  return null;
}

async function executePlan(plan: FolderPlan, emit: Emit): Promise<FolderOutcome> {
  const { folderName, downloadId, rootFolder, destinationBase, operations } = plan;
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

  // Clean slate. Logged explicitly because an unattended sweep can reach this
  // path without anyone having reviewed the plan first.
  try {
    const { stdout } = await execAsync(`ls -A ${shellEscape(destRoot)} 2>/dev/null | head -1`);
    if (stdout.trim()) {
      emit("log", {
        folderName,
        action: "OVERWRITE",
        detail: `Replacing existing contents of ${destRoot}`,
      });
    }
    await execAsync(`rm -rf ${shellEscape(destRoot)}`);
  } catch {
    // Already gone or never existed
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

    emit("log", { folderName, action: "COPY", detail: `${fileName}${sizeLabel}` });

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

export async function executePlans(plans: FolderPlan[], emit: Emit = () => {}): Promise<FolderOutcome[]> {
  const outcomes: FolderOutcome[] = [];
  for (const plan of plans) {
    outcomes.push(await executePlan(plan, emit));
  }
  emit("complete", { organized: plans.length });
  return outcomes;
}
