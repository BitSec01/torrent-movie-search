import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
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

/** Ensure a path is within /mnt/storage to prevent escape */
function sanitizePath(p: string): string {
  const resolved = p.replace(/\/+/g, "/").replace(/\.\./g, "");
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error(`Path ${resolved} is outside allowed storage root`);
  }
  return resolved;
}

/** Shell-escape a string for safe use in commands */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const SYSTEM_PROMPT = `You are a media file organizer for a Plex media server. Your job is to move and rename downloaded torrent files into the correct Plex-compatible folder structure.

## Rules:
1. **Movies** go to /mnt/storage/Movies/ with structure:
   /mnt/storage/Movies/MovieName (Year)/MovieName (Year).ext
   Movies should ALWAYS be in a subfolder even if it's a single file.
2. **TV Series** go to /mnt/storage/Series/ with structure:
   /mnt/storage/Series/ShowName (Year)/Season XX/ShowName (Year) - sXXeXX - EpisodeName.ext
3. Clean up filenames: remove quality tags (720p, 1080p, BrRip, x264, YIFY, etc.), torrent group names, and encoding info.
4. Keep ONLY the title, year, and for series the season/episode info.
5. For series with multiple episodes, organize each into the correct season folder.
6. Keep only English language files. Remove subtitle files for other languages (but keep .srt/.sub/.ass/.ssa/.vtt/.smi files that are English or unlabeled).
7. Keep video files (.mkv, .mp4, .avi, .m4v, .wmv) and English subtitles. Remove .txt, .nfo, sample files, and non-English subs.
8. If a torrent has a folder, move the ENTIRE folder first to the destination, THEN rename files inside it.
9. Use the "Season" word in English for season directories: "Season 01", "Season 02", etc.
10. Use two-digit padding for season and episode numbers: s01e01, s02e17, etc.

## Subtitle Naming (Plex conventions):
External subtitle files must follow these naming rules:
- **Movies**: MovieName (Year).[lang].ext — e.g. "Avatar (2009).en.srt"
- **TV Episodes**: ShowName (Year) - sXXeYY.[lang].ext — e.g. "Absolutely Fabulous - s02e03.eng.smi"
- Use ISO-639-1 (2-letter: en, de, fr) or ISO-639-2/B (3-letter: eng, deu, fra) language codes.
- **Forced subtitles** (foreign-language parts only): add ".forced" — e.g. "Avatar (2009).en.forced.srt"
- **SDH/CC subtitles**: add ".sdh" or ".cc" — e.g. "Avatar (2009).en.sdh.srt"
- If subtitle language is unknown/unlabeled, use ".en" by default.
- Supported formats: .srt, .smi, .ssa, .ass, .vtt (full Plex support). VOBSUB/PGS may work but aren't ideal.
- Subtitles can also live in a "Subs" or "Subtitles" subfolder in the same directory as the video.
  Example: /Movies/Avatar (2009)/Subs/Avatar (2009).en.srt

## Process:
1. First, use list_directory to see what's in the torrent's download path.
2. Determine if it's a movie or series (you'll be told which).
3. Create the proper directory structure.
4. Move the content to the proper location.
5. Rename files to match Plex conventions (including subtitles).
6. Call mark_complete when done, providing the final destination path.

## Examples:
- "We Bought a Zoo (2011) 720p BrRip x264 - 800MB - YIFY.mp4" → "We Bought a Zoo (2011).mp4"
- "We.Bought.A.Zoo.2011.720p.BrRip.x264.YIFY.srt" → "We Bought a Zoo (2011).en.srt"
- "Breaking.Bad.S01E01.720p.BluRay.x264-DEMAND.mkv" → "Breaking Bad (2008) - s01e01 - Pilot.mkv"
- A folder "Game.of.Thrones.S01.Complete.720p" → Move to /mnt/storage/Series/Game of Thrones (2011)/Season 01/ and rename each episode.
- Movie folder with subs: Move to /mnt/storage/Movies/Avatar (2009)/ keeping video + subs, rename both.

IMPORTANT: You will be given the correct title and year from our database. Use those exact values, not what's in the filename. Always call mark_complete at the end with the final path.`;

/**
 * POST /api/library/organize
 * Organizes a single completed download using AI.
 * Body: { downloadId: string } or empty to auto-pick the next completed one.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const downloadId = body.downloadId;

    // Find the download to organize
    let target;
    if (downloadId) {
      target = db.select().from(download).where(eq(download.id, downloadId)).get();
    } else {
      // Auto-pick the oldest completed download
      target = db.select().from(download).where(eq(download.status, "completed")).get();
    }

    if (!target) {
      return NextResponse.json({ message: "No downloads ready to organize" });
    }

    if (target.status !== "completed" && target.status !== "failed") {
      return NextResponse.json(
        { error: `Download is in "${target.status}" state, must be "completed" or "failed" to organize` },
        { status: 400 }
      );
    }

    // Mark as organizing
    db.update(download)
      .set({ status: "organizing", updatedAt: new Date() })
      .where(eq(download.id, target.id))
      .run();

    const mediaType = target.type === "series" ? "TV Series" : "Movie";
    const sourcePath = target.originalPath || `${TORRENTS_DIR}/${target.torrentName}`;

    let finalDestination = "";

    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        prompt: `Organize this ${mediaType} download:

**Title:** ${target.title}
**Year:** ${target.year || "Unknown"}
**Type:** ${target.type}
**IMDb ID:** ${target.imdbId || "N/A"}
**Total Seasons:** ${target.totalSeasons || "N/A"}
**Current Path:** ${sourcePath}
**Torrent Name:** ${target.torrentName || "Unknown"}

The destination root for movies is ${MOVIES_DIR} and for series is ${SERIES_DIR}.

Please list the source directory first, then create the correct structure, move the files, rename them properly, and call mark_complete when done.`,
        tools: {
          list_directory: {
            description: "List files and folders in a directory within /mnt/storage",
            inputSchema: zodSchema(z.object({
              path: z.string().describe("Absolute path to list"),
            })),
            execute: async ({ path: dirPath }: { path: string }) => {
              const safePath = sanitizePath(dirPath);
              try {
                const { stdout } = await execAsync(
                  `find ${shellEscape(safePath)} -maxdepth 2 -type f -o -type d 2>/dev/null | head -100`
                );
                return stdout || "(empty directory)";
              } catch {
                return `(error listing ${safePath} - may not exist)`;
              }
            },
          },
          create_directory: {
            description: "Create a directory (and parents) within /mnt/storage",
            inputSchema: zodSchema(z.object({
              path: z.string().describe("Absolute path of directory to create"),
            })),
            execute: async ({ path: dirPath }: { path: string }) => {
              const safePath = sanitizePath(dirPath);
              await execAsync(`mkdir -p ${shellEscape(safePath)}`);
              return `Created: ${safePath}`;
            },
          },
          move_path: {
            description: "Move a file or directory from source to destination within /mnt/storage",
            inputSchema: zodSchema(z.object({
              source: z.string().describe("Absolute source path"),
              destination: z.string().describe("Absolute destination path"),
            })),
            execute: async ({ source, destination }: { source: string; destination: string }) => {
              const safeSrc = sanitizePath(source);
              const safeDst = sanitizePath(destination);
              try {
                await execAsync(`mv ${shellEscape(safeSrc)} ${shellEscape(safeDst)}`);
                return `Moved: ${safeSrc} → ${safeDst}`;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return `Error moving: ${msg}`;
              }
            },
          },
          rename_path: {
            description: "Rename a file or directory within /mnt/storage",
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
                return `Renamed: ${safeSrc} → ${safeDst}`;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return `Error renaming: ${msg}`;
              }
            },
          },
          delete_file: {
            description: "Delete a file (not directory) within /mnt/storage. Use to clean up non-English subs, .nfo, .txt, sample files",
            inputSchema: zodSchema(z.object({
              path: z.string().describe("Absolute path of file to delete"),
            })),
            execute: async ({ path: filePath }: { path: string }) => {
              const safePath = sanitizePath(filePath);
              try {
                await execAsync(`rm -f ${shellEscape(safePath)}`);
                return `Deleted: ${safePath}`;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return `Error deleting: ${msg}`;
              }
            },
          },
          mark_complete: {
            description: "Mark the organization as complete. Call this when all files are moved and renamed properly.",
            inputSchema: zodSchema(z.object({
              destinationPath: z.string().describe("The final destination root path (e.g. /mnt/storage/Movies/MovieName (Year))"),
              summary: z.string().describe("Brief summary of what was done"),
            })),
            execute: async ({ destinationPath, summary }: { destinationPath: string; summary: string }) => {
              finalDestination = destinationPath;
              return `Marked complete: ${summary}`;
            },
          },
        },
        stopWhen: stepCountIs(15),
      });

      // Update DB with success
      db.update(download)
        .set({
          status: "organized",
          destinationPath: finalDestination || null,
          updatedAt: new Date(),
        })
        .where(eq(download.id, target.id))
        .run();

      return NextResponse.json({
        success: true,
        downloadId: target.id,
        destination: finalDestination,
        text: result.text,
      });
    } catch (aiError) {
      // Mark as failed
      const errorMsg = aiError instanceof Error ? aiError.message : String(aiError);
      db.update(download)
        .set({
          status: "failed",
          errorMessage: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(download.id, target.id))
        .run();

      console.error("[Organize] AI error:", aiError);
      return NextResponse.json(
        { error: `Organization failed: ${errorMsg}` },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[Organize] error:", err);
    return NextResponse.json(
      { error: "Failed to organize download" },
      { status: 500 }
    );
  }
}
