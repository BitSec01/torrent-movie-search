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

## CRITICAL RULES - FOLLOW EXACTLY:
1. **Movies** go to /mnt/storage/Movies/ with structure:
   /mnt/storage/Movies/MovieName (Year)/MovieName (Year).ext
   Movies MUST ALWAYS be in a subfolder. You MUST move the video file into it.
2. **TV Series** go to /mnt/storage/Series/ with structure:
   /mnt/storage/Series/ShowName (Year)/Season XX/ShowName (Year) - sXXeXX - EpisodeName.ext
3. **YOU MUST MOVE THE ACTUAL VIDEO FILES.** Creating a folder is NOT enough. After creating the destination folder, you MUST call move_path for each .mkv/.mp4/.avi/.m4v/.wmv file.
4. Clean up filenames: remove quality tags (720p, 1080p, BrRip, x264, YIFY, etc.), torrent group names, and encoding info.
5. Keep ONLY the title, year, and for series the season/episode info.
6. For series with multiple episodes, move and rename EACH episode file individually into the correct season folder.
7. Keep video files (.mkv, .mp4, .avi, .m4v, .wmv) and English subtitles (.srt, .sub, .ass, .ssa, .vtt, .smi). Remove .txt, .nfo, sample files, non-English subs.
8. Use the "Season" word in English for season directories: "Season 01", "Season 02", etc.
9. Use two-digit padding for season and episode numbers: s01e01, s02e17, etc.

## Subtitle Naming (Plex conventions):
- Movies: MovieName (Year).[lang].ext e.g. "Avatar (2009).en.srt"
- TV Episodes: ShowName (Year) - sXXeYY.[lang].ext e.g. "Breaking Bad (2008) - s01e01.en.srt"
- If subtitle language is unknown/unlabeled, use ".en" by default.

## REQUIRED PROCESS - DO EVERY STEP:
1. Call list_directory on the source path to see all files.
2. Create the destination directory (e.g. /mnt/storage/Movies/Title (Year)/).
3. For EACH video file found: call move_path to move it to the destination with the correct Plex filename.
4. For EACH subtitle file found: call move_path to move it with the correct Plex subtitle filename.
5. Delete any junk files (.txt, .nfo, .jpg, .png, sample files). If source was a folder and is now empty, delete it.
6. Call mark_complete with the destination path ONLY AFTER all files have been moved.

## Examples:
- Source: /mnt/storage/torrents/We.Bought.A.Zoo.2011.720p.BrRip.x264.YIFY/We.Bought.A.Zoo.2011.720p.mp4
  -> move_path to /mnt/storage/Movies/We Bought a Zoo (2011)/We Bought a Zoo (2011).mp4
- Source subtitle: We.Bought.A.Zoo.2011.720p.BrRip.x264.YIFY.srt
  -> move_path to /mnt/storage/Movies/We Bought a Zoo (2011)/We Bought a Zoo (2011).en.srt
- Series folder with 10 episodes: create /mnt/storage/Series/Breaking Bad (2008)/Season 01/, then move EACH episode file with move_path and rename it.

IMPORTANT: You will be given the correct title and year from our database. Use those exact values, not what is in the filename. NEVER call mark_complete until you have actually moved the video file(s) to the destination.`;

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
        prompt: `Organise this ${mediaType} download:

**Title:** ${target.title}
**Year:** ${target.year || "Unknown"}
**Type:** ${target.type}
**IMDb ID:** ${target.imdbId || "N/A"}
**Total Seasons:** ${target.totalSeasons || "N/A"}
**Current Path:** ${sourcePath}
**Torrent Name:** ${target.torrentName || "Unknown"}

The destination root for movies is ${MOVIES_DIR} and for series is ${SERIES_DIR}.

Step 1: Call list_directory on the source path first to see exactly what files exist.
Step 2: Create the destination folder.
Step 3: Move EACH video and subtitle file individually to the destination with the correct Plex name.
Step 4: Clean up junk files.
Step 5: Call mark_complete with the final destination path.`,
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
                  `find ${shellEscape(safePath)} -maxdepth 3 -type f -o -type d 2>/dev/null | head -200`
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
            description: "Move a file or directory from source to destination within /mnt/storage. Use this to move video files and subtitles to their Plex destination.",
            inputSchema: zodSchema(z.object({
              source: z.string().describe("Absolute source path"),
              destination: z.string().describe("Absolute destination path including the new filename"),
            })),
            execute: async ({ source, destination }: { source: string; destination: string }) => {
              const safeSrc = sanitizePath(source);
              const safeDst = sanitizePath(destination);
              try {
                await execAsync(`mv ${shellEscape(safeSrc)} ${shellEscape(safeDst)}`);
                return `Moved: ${safeSrc} -> ${safeDst}`;
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
                return `Renamed: ${safeSrc} -> ${safeDst}`;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return `Error renaming: ${msg}`;
              }
            },
          },
          delete_file: {
            description: "Delete a file or empty directory within /mnt/storage. Use to clean up non-English subs, .nfo, .txt, sample files, and empty source folders.",
            inputSchema: zodSchema(z.object({
              path: z.string().describe("Absolute path of file or empty directory to delete"),
            })),
            execute: async ({ path: filePath }: { path: string }) => {
              const safePath = sanitizePath(filePath);
              try {
                await execAsync(`rm -rf ${shellEscape(safePath)}`);
                return `Deleted: ${safePath}`;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return `Error deleting: ${msg}`;
              }
            },
          },
          mark_complete: {
            description: "Mark the organisation as complete. ONLY call this AFTER all video and subtitle files have been moved to the destination.",
            inputSchema: zodSchema(z.object({
              destinationPath: z.string().describe("The final destination root path (e.g. /mnt/storage/Movies/MovieName (Year))"),
              summary: z.string().describe("Brief summary of what was done, listing files moved"),
            })),
            execute: async ({ destinationPath, summary }: { destinationPath: string; summary: string }) => {
              finalDestination = destinationPath;
              return `Marked complete: ${summary}`;
            },
          },
        },
        stopWhen: stepCountIs(20),
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
        { error: `Organisation failed: ${errorMsg}` },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[Organize] error:", err);
    return NextResponse.json(
      { error: "Failed to organise download" },
      { status: 500 }
    );
  }
}
