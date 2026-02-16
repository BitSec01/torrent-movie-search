import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const STORAGE_ROOT = "/mnt/storage";

export interface StorageItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: string;
  children?: StorageItem[];
}

/**
 * GET /api/library/storage-tree
 * Returns a structured directory tree of /mnt/storage (Movies, Series, torrents).
 */
export async function GET() {
  try {
    const sections = ["Movies", "Series", "torrents"];
    const tree: Record<string, StorageItem[]> = {};

    for (const section of sections) {
      const sectionPath = `${STORAGE_ROOT}/${section}`;
      try {
        const { stdout } = await execAsync(
          `find '${sectionPath}' -maxdepth 3 -printf '%y|%s|%P\\n' 2>/dev/null | head -500`
        );
        const items: StorageItem[] = [];
        const dirMap = new Map<string, StorageItem>();

        for (const line of stdout.trim().split("\n")) {
          if (!line) continue;
          const [typeChar, sizeStr, relPath] = line.split("|", 3);
          if (!relPath) continue;

          const parts = relPath.split("/");
          const name = parts[parts.length - 1];
          const isDir = typeChar === "d";

          const item: StorageItem = {
            name,
            path: `${sectionPath}/${relPath}`,
            type: isDir ? "directory" : "file",
            ...(isDir ? { children: [] } : { size: formatSize(parseInt(sizeStr || "0", 10)) }),
          };

          if (parts.length === 1) {
            items.push(item);
            if (isDir) dirMap.set(relPath, item);
          } else {
            const parentPath = parts.slice(0, -1).join("/");
            const parent = dirMap.get(parentPath);
            if (parent && parent.children) {
              parent.children.push(item);
              if (isDir) dirMap.set(relPath, item);
            }
          }
        }

        // Sort: directories first, then alphabetically
        const sortItems = (arr: StorageItem[]) => {
          arr.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          for (const item of arr) {
            if (item.children) sortItems(item.children);
          }
        };
        sortItems(items);
        tree[section] = items;
      } catch {
        tree[section] = [];
      }
    }

    return NextResponse.json({ tree });
  } catch (err) {
    console.error("[Storage Tree] error:", err);
    return NextResponse.json({ error: "Failed to read storage tree" }, { status: 500 });
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}
