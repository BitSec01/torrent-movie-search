import { readdir, stat } from "fs/promises";
import { join } from "path";

export interface WalkEntry {
  /** Path relative to the walk root, matching find's %P. */
  relPath: string;
  type: "file" | "directory";
  size: number;
}

export interface WalkResult {
  entries: WalkEntry[];
  /** The limit cut the walk short, so the listing is incomplete */
  truncated: boolean;
}

/**
 * Depth-limited directory walk.
 *
 * This replaces `find -printf`, which is a GNU findutils extension: the app
 * runs on an Alpine image whose busybox find rejects it, so the shell version
 * silently produced nothing.
 *
 * `truncated` is returned rather than left implicit because a walk that stops
 * at the limit looks exactly like a smaller library: the old 500-entry cap hid
 * more than half of a 1140-entry Series tree from the organise page, and
 * nothing anywhere said so.
 */
export async function walkTree(
  root: string,
  maxDepth: number,
  limit = 20_000
): Promise<WalkResult> {
  const entries: WalkEntry[] = [];

  const visit = async (dir: string, relBase: string, depth: number) => {
    if (depth > maxDepth || entries.length >= limit) return;

    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirents) {
      if (entries.length >= limit) return;

      const relPath = relBase ? `${relBase}/${dirent.name}` : dirent.name;
      const absPath = join(dir, dirent.name);
      const isDir = dirent.isDirectory();

      let size = 0;
      if (!isDir) {
        try {
          size = (await stat(absPath)).size;
        } catch {
          continue;
        }
      }

      entries.push({ relPath, type: isDir ? "directory" : "file", size });

      if (isDir) await visit(absPath, relPath, depth + 1);
    }
  };

  await visit(root, "", 1);
  return { entries, truncated: entries.length >= limit };
}
