import { NextResponse } from "next/server";
import { storageRoot } from "@/lib/config";
import { walkTree } from "@/lib/library/walk";

const STORAGE_ROOT = storageRoot();

export interface StorageItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: string;
  children?: StorageItem[];
}

/**
 * GET /api/library/storage-tree
 * Returns a structured directory tree of the storage root (Movies, Series, torrents).
 */
export async function GET() {
  try {
    const sections = ["Movies", "Series", "torrents"];
    const tree: Record<string, StorageItem[]> = {};
    const truncated: string[] = [];

    for (const section of sections) {
      const sectionPath = `${STORAGE_ROOT}/${section}`;
      try {
        const walked = await walkTree(sectionPath, 3);
        if (walked.truncated) truncated.push(section);
        const entries = walked.entries;
        const items: StorageItem[] = [];
        const dirMap = new Map<string, StorageItem>();

        for (const entry of entries) {
          const { relPath } = entry;
          const parts = relPath.split("/");
          const name = parts[parts.length - 1];
          const isDir = entry.type === "directory";

          const item: StorageItem = {
            name,
            path: `${sectionPath}/${relPath}`,
            type: entry.type,
            ...(isDir ? { children: [] } : { size: formatSize(entry.size) }),
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

    return NextResponse.json({ tree, truncated });
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
