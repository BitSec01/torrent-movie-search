import { NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText, zodSchema, stepCountIs } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { moviesDir, organizeModel, seriesDir, storageRoot, torrentsDir } from "@/lib/config";

const execAsync = promisify(exec);

const STORAGE_ROOT = storageRoot();
const MOVIES_DIR = moviesDir();
const SERIES_DIR = seriesDir();
const TORRENTS_DIR = torrentsDir();

function sanitizePath(p: string): string {
  const resolved = p.replace(/\/+/g, "/").replace(/\.\./g, "");
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error(`Path ${resolved} is outside allowed storage root`);
  }
  return resolved;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const SYSTEM_PROMPT = `You are a media file organizer for a Plex media server. You are given a listing of items in the torrents download folder that need to be organized into proper Plex-compatible structure.

## Rules:
1. **Movies** go to ${MOVIES_DIR}/MovieName (Year)/MovieName (Year).ext
   Movies should ALWAYS be in a subfolder even if it's a single file.
2. **TV Series** go to ${SERIES_DIR}/ShowName (Year)/Season XX/ShowName (Year) - sXXeXX.ext
3. Clean filenames: remove quality tags (720p, 1080p, BrRip, x264, YIFY, etc.), group names, encoding info.
4. Keep video files (.mkv, .mp4, .avi, .m4v, .wmv) and subtitle files (.srt, .sub, .ass, .ssa, .vtt, .smi).
5. Remove junk: .txt, .nfo, .jpg, .png, sample files, .exe, .dll.
6. Use two-digit padding: Season 01, s01e01, etc.
7. Subtitle naming: MovieName (Year).[lang].ext or ShowName (Year) - sXXeYY.[lang].ext
   Use ".en" for English or unknown language subtitles.
8. If something looks like malware (contains .exe, .dll), delete the entire folder.
9. For items you can't identify (unclear if movie or series), make your best guess from the name.

## Process per item:
1. List the item's contents
2. Determine if it's a movie or series
3. Create destination directory
4. Move files, rename properly
5. Clean up source folder

Work through ALL items listed. Call mark_complete at the very end with a summary of everything you did.`;

interface LogEntry {
  time: string;
  action: string;
  detail: string;
}

/**
 * POST /api/library/organize-storage
 * Scans the torrents staging dir for unorganized items and uses AI to organize them.
 * Returns a log of all actions taken.
 */
export async function POST() {
  const logs: LogEntry[] = [];
  const addLog = (action: string, detail: string) => {
    logs.push({ time: new Date().toISOString(), action, detail });
  };

  try {
    // Scan torrents folder for items
    let listing: string;
    try {
      const { stdout } = await execAsync(
        `ls -1 '${TORRENTS_DIR}' 2>/dev/null`
      );
      listing = stdout.trim();
    } catch {
      listing = "";
    }

    if (!listing) {
      addLog("INFO", "Torrents folder is empty - nothing to organize");
      return NextResponse.json({ logs, organized: 0 });
    }

    const items = listing.split("\n").filter(Boolean);
    // Filter out non-media items like logs
    const mediaItems = items.filter(
      (i) => !i.endsWith(".log") && !i.startsWith(".")
    );

    if (mediaItems.length === 0) {
      addLog("INFO", "No media items found in torrents folder");
      return NextResponse.json({ logs, organized: 0 });
    }

    addLog("SCAN", `Found ${mediaItems.length} items in torrents: ${mediaItems.join(", ")}`);

    // Get detailed listing
    const { stdout: detailedListing } = await execAsync(
      `find '${TORRENTS_DIR}' -maxdepth 2 -printf '%y|%P\\n' 2>/dev/null | head -200`
    );

    // Also check what's already in Movies/ and Series/ to avoid duplicates
    let existingMovies = "";
    let existingSeries = "";
    try {
      const m = await execAsync(`ls -1 '${MOVIES_DIR}' 2>/dev/null`);
      existingMovies = m.stdout.trim();
    } catch { /* empty */ }
    try {
      const s = await execAsync(`ls -1 '${SERIES_DIR}' 2>/dev/null`);
      existingSeries = s.stdout.trim();
    } catch { /* empty */ }

    let summary = "";

    const result = await generateText({
      model: openai(organizeModel()),
      system: SYSTEM_PROMPT,
      prompt: `Please organize the following items from ${TORRENTS_DIR}:

**Items to organize:**
${mediaItems.map((i) => `- ${i}`).join("\n")}

**Detailed listing:**
${detailedListing}

**Already in Movies/:**
${existingMovies || "(empty)"}

**Already in Series/:**
${existingSeries || "(empty)"}

If an item already exists in Movies/ or Series/ (duplicate), just delete the torrent copy.
Process each item, organize it properly, and call mark_complete when ALL items are done.`,
      tools: {
        list_directory: {
          description: `List files and folders in a directory within ${STORAGE_ROOT}`,
          inputSchema: zodSchema(z.object({
            path: z.string().describe("Absolute path to list"),
          })),
          execute: async ({ path: dirPath }: { path: string }) => {
            const safePath = sanitizePath(dirPath);
            try {
              const { stdout } = await execAsync(
                `find ${shellEscape(safePath)} -maxdepth 2 -type f -o -type d 2>/dev/null | head -100`
              );
              addLog("LIST", safePath);
              return stdout || "(empty directory)";
            } catch {
              return `(error listing ${safePath} - may not exist)`;
            }
          },
        },
        create_directory: {
          description: `Create a directory (and parents) within ${STORAGE_ROOT}`,
          inputSchema: zodSchema(z.object({
            path: z.string().describe("Absolute path of directory to create"),
          })),
          execute: async ({ path: dirPath }: { path: string }) => {
            const safePath = sanitizePath(dirPath);
            await execAsync(`mkdir -p ${shellEscape(safePath)}`);
            addLog("MKDIR", safePath);
            return `Created: ${safePath}`;
          },
        },
        move_path: {
          description: `Move a file or directory from source to destination within ${STORAGE_ROOT}`,
          inputSchema: zodSchema(z.object({
            source: z.string().describe("Absolute source path"),
            destination: z.string().describe("Absolute destination path"),
          })),
          execute: async ({ source, destination }: { source: string; destination: string }) => {
            const safeSrc = sanitizePath(source);
            const safeDst = sanitizePath(destination);
            try {
              await execAsync(`mv ${shellEscape(safeSrc)} ${shellEscape(safeDst)}`);
              addLog("MOVE", `${safeSrc} → ${safeDst}`);
              return `Moved: ${safeSrc} → ${safeDst}`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              addLog("ERROR", `Move failed: ${msg}`);
              return `Error moving: ${msg}`;
            }
          },
        },
        rename_path: {
          description: `Rename a file or directory within ${STORAGE_ROOT}`,
          inputSchema: zodSchema(z.object({
            source: z.string().describe("Current absolute path"),
            newName: z.string().describe("New filename (just the name, not full path)"),
          })),
          execute: async ({ source, newName }: { source: string; newName: string }) => {
            const safeSrc = sanitizePath(source);
            const parentDir = safeSrc.substring(0, safeSrc.lastIndexOf("/"));
            const safeDst = sanitizePath(`${parentDir}/${newName}`);
            try {
              await execAsync(`mv ${shellEscape(safeSrc)} ${shellEscape(safeDst)}`);
              addLog("RENAME", `${safeSrc} → ${newName}`);
              return `Renamed: ${safeSrc} → ${safeDst}`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              addLog("ERROR", `Rename failed: ${msg}`);
              return `Error renaming: ${msg}`;
            }
          },
        },
        delete_path: {
          description: `Delete a file or directory within ${STORAGE_ROOT}. Use to clean up junk, malware, or empty folders.`,
          inputSchema: zodSchema(z.object({
            path: z.string().describe("Absolute path to delete"),
          })),
          execute: async ({ path: filePath }: { path: string }) => {
            const safePath = sanitizePath(filePath);
            try {
              await execAsync(`rm -rf ${shellEscape(safePath)}`);
              addLog("DELETE", safePath);
              return `Deleted: ${safePath}`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              addLog("ERROR", `Delete failed: ${msg}`);
              return `Error deleting: ${msg}`;
            }
          },
        },
        mark_complete: {
          description: "Mark the entire batch organization as complete. Call this when ALL items are processed.",
          inputSchema: zodSchema(z.object({
            summary: z.string().describe("Summary of all operations performed"),
            itemsOrganized: z.number().describe("Number of items that were organized"),
          })),
          execute: async ({ summary: s, itemsOrganized }: { summary: string; itemsOrganized: number }) => {
            summary = s;
            addLog("COMPLETE", `${itemsOrganized} items organized: ${s}`);
            return `Done: ${s}`;
          },
        },
      },
      stopWhen: stepCountIs(30),
    });

    addLog("DONE", summary || result.text || "Organization finished");

    return NextResponse.json({
      logs,
      organized: mediaItems.length,
      summary: summary || result.text,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addLog("ERROR", `Fatal error: ${msg}`);
    console.error("[Organize Storage] error:", err);
    return NextResponse.json({ logs, error: msg }, { status: 500 });
  }
}
