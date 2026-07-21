/**
 * Reports what is already sitting at a planned destination, so the review
 * modal can offer merge-or-replace only when there is actually something to
 * lose. Read-only.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { moviesDir, seriesDir } from "@/lib/config";
import { sanitizePath, shellEscape } from "./paths";
import type { DestinationInfo } from "./types";

const execAsync = promisify(exec);

const MOVIES_DIR = moviesDir();
const SERIES_DIR = seriesDir();

const EMPTY: DestinationInfo = { exists: false, entries: [], fileCount: 0 };

export async function inspectDestination(
  destinationBase: string,
  rootFolder: string
): Promise<DestinationInfo> {
  if (!destinationBase || !rootFolder) return EMPTY;

  let destRoot: string;
  try {
    destRoot = sanitizePath(`${destinationBase}/${rootFolder}`);
  } catch {
    return EMPTY;
  }

  if (!destRoot.startsWith(MOVIES_DIR + "/") && !destRoot.startsWith(SERIES_DIR + "/")) {
    return EMPTY;
  }

  try {
    await execAsync(`test -d ${shellEscape(destRoot)}`);
  } catch {
    return EMPTY;
  }

  const [entries, fileCount] = await Promise.all([listEntries(destRoot), countFiles(destRoot)]);

  // A directory that exists but holds nothing is not worth warning about
  if (entries.length === 0 && fileCount === 0) return EMPTY;

  return { exists: true, entries, fileCount };
}

async function listEntries(destRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`ls -1 ${shellEscape(destRoot)} 2>/dev/null | head -20`);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function countFiles(destRoot: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `find ${shellEscape(destRoot)} -type f 2>/dev/null | wc -l`
    );
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}
