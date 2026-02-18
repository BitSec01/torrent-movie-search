import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText, zodSchema, stepCountIs } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const STORAGE_ROOT = "/mnt/storage";
const MOVIES_DIR = `${STORAGE_ROOT}/Movies`;
const SERIES_DIR = `${STORAGE_ROOT}/Series`;
const TORRENTS_DIR = `${STORAGE_ROOT}/torrents`;

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

const SYSTEM_PROMPT = `You are a media file organizer for a Plex media server. You are given a single folder or file from the torrents directory and must organise it into the proper Plex-compatible structure.

## CRITICAL RULES - FOLLOW EXACTLY:
1. **Movies** go to /mnt/storage/Movies/MovieName (Year)/MovieName (Year).ext
   Each movie MUST be in its own subfolder.
2. **TV Series** go to /mnt/storage/Series/ShowName (Year)/Season XX/ShowName (Year) - sXXeXX - EpisodeName.ext
3. YOU MUST COPY (not move) video files to the destination so the original torrent folder is preserved.
   Use copy_file for individual files. The source torrent folder must remain intact.
4. For series: if the destination season folder already has some episodes, SKIP any files that already exist there (check first with list_directory).
5. Clean filenames: remove quality tags (720p, 1080p, BrRip, x264, YIFY, etc.), group names, encoding info.
6. Keep only the title, year, and for series the season/episode info.
7. For series with multiple episodes, copy EACH episode individually to the correct Season folder.
8. Keep video files (.mkv, .mp4, .avi, .m4v, .wmv) and English subtitles (.srt, .sub, .ass, .ssa, .vtt, .smi).
9. Use "Season 01", "Season 02" etc. for season directories (two-digit padded).
10. Use s01e01, s02e17 etc. format for episodes (two-digit padded).
11. If item looks like malware (.exe, .dll files), do NOT copy - just call mark_complete with a warning.

## Subtitle Naming:
- Movies: MovieName (Year).[lang].ext e.g. "Avatar (2009).en.srt"
- TV Episodes: ShowName (Year) - sXXeYY.[lang].ext e.g. "Breaking Bad (2008) - s01e01.en.srt"
- Use ".en" for unknown language subtitles.

## REQUIRED PROCESS:
1. Call list_directory on the source path to see all contents.
2. Determine if it is a movie or series from the filenames.
3. Check the destination folder with list_directory to see what already exists (skip duplicates).
4. Create destination directory structure with create_directory.
5. For EACH video file: call copy_file to copy it to the destination with correct Plex filename.
6. For EACH subtitle file: call copy_file to copy it with correct Plex subtitle filename.
7. Call mark_complete with the destination path and a summary.

## Examples:
- Source folder "We.Bought.A.Zoo.2011.720p/" with "We.Bought.A.Zoo.2011.720p.mp4"
  -> copy_file source to /mnt/storage/Movies/We Bought a Zoo (2011)/We Bought a Zoo (2011).mp4
- Source folder "Breaking.Bad.S01.Complete/" with 7 episodes
  -> For each: copy_file to /mnt/storage/Series/Breaking Bad (2008)/Season 01/Breaking Bad (2008) - s01eXX.mkv
  -> Skip any episode file that already exists at destination.

IMPORTANT: NEVER delete the source torrent folder. Only COPY files to the destination. Call mark_complete at the end.`;

interface LogEntry {
  time: string;
  action: string;
  detail: string;
}

/**
 * POST /api/library/organize-folder
 * Organises a single folder/file from the torrents directory.
 * Copies (not moves) files to the proper Plex structure, skipping existing files.
 * Body: { folderName: string } - the name of the folder/file inside /mnt/storage/torrents/
 */
export async function POST(req: NextRequest) {
  const logs: LogEntry[] = [];
  const addLog = (action: string, detail: string) => {
    logs.push({ time: new Date().toISOString(), action, detail });
  };

  try {
    const { folderName } = await req.json();
    if (!folderName || typeof folderName !== "string") {
      return NextResponse.json({ error: "folderName is required" }, { status: 400 });
    }

    const sourcePath = sanitizePath(`${TORRENTS_DIR}/${folderName}`);
    addLog("SCAN", `Organising: ${folderName}`);

    // Get existing Movies and Series for context
    let existingMovies = "";
    let existingSeries = "";
    try {
      const m = await execAsync(`ls -1 ${shellEscape(MOVIES_DIR)} 2>/dev/null`);
      existingMovies = m.stdout.trim();
    } catch { /* empty */ }
    try {
      const s = await execAsync(`ls -1 ${shellEscape(SERIES_DIR)} 2>/dev/null`);
      existingSeries = s.stdout.trim();
    } catch { /* empty */ }

    let finalDestination = "";
    let summary = "";

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      prompt: `Please organise this item from the torrents folder:

**Source path:** ${sourcePath}
**Folder/file name:** ${folderName}
**Movies destination:** ${MOVIES_DIR}
**Series destination:** ${SERIES_DIR}

**Already in Movies/:**
${existingMovies || "(empty)"}

**Already in Series/:**
${existingSeries || "(empty)"}

Step 1: Call list_directory on the source path to see what files are inside.
Step 2: Decide if it is a movie or series.
Step 3: Check the destination to see if any files already exist there.
Step 4: Create destination folder structure.
Step 5: Copy each video/subtitle file with the correct Plex name (skip existing).
Step 6: Call mark_complete.`,
      tools: {
        list_directory: {
          description: "List all files and subfolders in a directory within /mnt/storage",
          inputSchema: zodSchema(z.object({
            path: z.string().describe("Absolute path to list"),
          })),
          execute: async ({ path: dirPath }: { path: string }) => {
            const safePath = sanitizePath(dirPath);
            try {
              const { stdout } = await execAsync(
                `find ${shellEscape(safePath)} -maxdepth 3 2>/dev/null | sort | head -200`
              );
              addLog("LIST", safePath);
              return stdout || "(empty or does not exist)";
            } catch {
              return `(error listing ${safePath})`;
            }
          },
        },
        create_directory: {
          description: "Create a directory (and all parents) within /mnt/storage",
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
        copy_file: {
          description: "Copy a single file from source to destination within /mnt/storage. Use this instead of move_path to preserve the original torrent folder.",
          inputSchema: zodSchema(z.object({
            source: z.string().describe("Absolute source file path"),
            destination: z.string().describe("Absolute destination file path including the new filename"),
          })),
          execute: async ({ source, destination }: { source: string; destination: string }) => {
            const safeSrc = sanitizePath(source);
            const safeDst = sanitizePath(destination);
            try {
              // Check if destination already exists
              const { stdout: check } = await execAsync(
                `test -f ${shellEscape(safeDst)} && echo "exists" || echo "new"`
              ).catch(() => ({ stdout: "new" }));
              if (check.trim() === "exists") {
                addLog("SKIP", `Already exists: ${safeDst}`);
                return `Skipped (already exists): ${safeDst}`;
              }
              await execAsync(`cp ${shellEscape(safeSrc)} ${shellEscape(safeDst)}`);
              addLog("COPY", `${safeSrc} -> ${safeDst}`);
              return `Copied: ${safeSrc} -> ${safeDst}`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              addLog("ERROR", `Copy failed: ${msg}`);
              return `Error copying: ${msg}`;
            }
          },
        },
        mark_complete: {
          description: "Mark this folder organisation as complete. Call when all files have been processed.",
          inputSchema: zodSchema(z.object({
            destinationPath: z.string().describe("The final destination root path (e.g. /mnt/storage/Movies/MovieName (Year) or /mnt/storage/Series/ShowName (Year))"),
            summary: z.string().describe("Brief summary of what was done"),
          })),
          execute: async ({ destinationPath, summary: s }: { destinationPath: string; summary: string }) => {
            finalDestination = destinationPath;
            summary = s;
            addLog("COMPLETE", `${destinationPath}: ${s}`);
            return `Done: ${s}`;
          },
        },
      },
      stopWhen: stepCountIs(25),
    });

    addLog("DONE", summary || result.text || "Organisation finished");

    return NextResponse.json({
      logs,
      destination: finalDestination,
      summary: summary || result.text,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addLog("ERROR", `Fatal error: ${msg}`);
    console.error("[Organize Folder] error:", err);
    return NextResponse.json({ logs, error: msg }, { status: 500 });
  }
}
