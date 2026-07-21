import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@ai-sdk/openai";
import { generateText, zodSchema, stepCountIs } from "ai";
import { z } from "zod";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import { moviesDir, organizeModel, seriesDir, storageRoot, torrentsDir } from "@/lib/config";

const execAsync = promisify(exec);

const STORAGE_ROOT = storageRoot();
const MOVIES_DIR = moviesDir();
const SERIES_DIR = seriesDir();
const TORRENTS_DIR = torrentsDir();

/**
 * Server-side lock: tracks folder names currently being organised.
 * Prevents double-triggering if the user clicks twice or navigates away and back.
 * Lives in module scope so it survives across requests within the same process.
 */
const inProgress = new Set<string>();

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

/**
 * Strip common torrent junk from a folder/file name to produce a cleaner
 * display name the AI can more reliably parse.
 *
 * Handles patterns like:
 *  - "www.UIndex.org - War Machine 2026 1080p …"  → "War Machine 2026 1080p …"
 *  - "[TorrentSite.com] Movie Name …"              → "Movie Name …"
 *  - "www.Site.net.Movie.Name.2024"                 → "Movie.Name.2024"
 */
function cleanTorrentName(raw: string): string {
  let name = raw;

  // Strip leading "www.Something.tld - " or "www.Something.tld." prefixes
  name = name.replace(/^www\.[a-z0-9-]+\.[a-z]{2,}[\s.\-–—]+/i, "");

  // Strip leading "[Site.com]" or "(Site.com)" tags
  name = name.replace(/^[\[(][a-z0-9._ -]+[\])]\s*/i, "");

  // Strip leading domain-like prefixes without www (e.g. "SiteName.org - ")
  name = name.replace(/^[a-z0-9-]+\.(com|org|net|io|to|cc|me|info)[\s.\-–—]+/i, "");

  return name.trim() || raw;
}

const SYSTEM_PROMPT = `You are a media file organizer for a Plex media server. You are given a single folder or file from the torrents directory and must organise it into the proper Plex-compatible structure.

## CRITICAL RULES - FOLLOW EXACTLY:
1. **Movies** go to ${MOVIES_DIR}/MovieName (Year)/MovieName (Year).ext
   Each movie MUST be in its own subfolder.
2. **TV Series** go to ${SERIES_DIR}/ShowName (Year)/Season XX/ShowName (Year) - sXXeXX - EpisodeName.ext
3. COPY (do not move) video files to the destination so the original torrent folder is preserved for seeding.
   Use copy_file for individual files. The source torrent folder must remain intact.
4. **Before copying, ALWAYS call delete_directory on the destination folder** to wipe any stale/empty/partial previous attempt. This ensures a clean slate. Then create_directory and copy fresh. The source torrent folder is NEVER deleted — only the destination is wiped.
5. Clean filenames: remove quality tags (720p, 1080p, 2160p, BrRip, WEBRip, x264, x265, YIFY, RARBG, etc.), group names, encoding info.
6. Keep only the title, year, and for series the season/episode info.
7. For series with multiple episodes, copy EACH episode individually to the correct Season folder.
8. Keep video files (.mkv, .mp4, .avi, .m4v, .wmv) and English subtitles (.srt, .sub, .ass, .ssa, .vtt, .smi).
9. Use "Season 01", "Season 02" etc. for season directories (two-digit padded).
10. Use s01e01, s02e17 etc. format for episodes (two-digit padded).
11. If item contains .exe or .dll files, do NOT copy anything - call mark_complete with a warning.

## ABSOLUTELY CRITICAL — SOURCE FILE PATHS:
- You MUST call list_directory on the source path FIRST, then use the EXACT file paths returned by list_directory when calling copy_file.
- NEVER guess or construct source file paths yourself. The actual filename on disk may differ from the folder name (e.g. it may include a release group suffix like "-BYNDR" or have different spacing/punctuation).
- The source path in copy_file must match a real file from list_directory output, character for character.

## Torrent Naming — Strip Junk:
Torrent folder names often contain website prefixes, release group tags, and encoding info that are NOT part of the title. You will be given a "Clean name" hint with these stripped. Examples:
- Folder: "www.UIndex.org - War Machine 2026 1080p NF WEB-DL DDP5 1 Atmos H 264"
  Clean name: "War Machine 2026 1080p NF WEB-DL DDP5 1 Atmos H 264"
  → Movie title: "War Machine", Year: 2026
- Folder: "[TGx]The.Substance.2024.2160p.WEBRip.x265"
  Clean name: "The.Substance.2024.2160p.WEBRip.x265"
  → Movie title: "The Substance", Year: 2024
Use the "Clean name" (or the known title/year from the database if provided) to determine the movie/series title. NEVER use website domains as part of the title or folder structure.

## Subtitle Naming:
- Movies: MovieName (Year).[lang].ext e.g. "Avatar (2009).en.srt"
- TV Episodes: ShowName (Year) - sXXeYY.[lang].ext e.g. "Maid (2021) - s01e01.en.srt"
- Use ".en" for unknown language subtitles.

## REQUIRED PROCESS - DO EVERY STEP:
1. Call list_directory on the source path to see all contents (video files, subtitles, etc.).
2. Determine if it is a movie or series from the filenames and folder name.
3. Determine the destination folder path (e.g. ${MOVIES_DIR}/War Machine (2026)/).
4. Call delete_directory on the destination folder to remove any previous partial/stale attempt. This is safe — we are about to re-copy everything from the source.
5. Create the destination directory structure with create_directory.
6. For EACH video/subtitle file: call copy_file using the EXACT source path from step 1's list_directory output.
7. Call mark_complete with the destination path and a summary.

## Examples:
- Source "The.Substance.2024.2160p.WEBRip.x265/" containing a .mkv
  -> copy_file to ${MOVIES_DIR}/The Substance (2024)/The Substance (2024).mkv
- Source "Maid S01 1080p WEBRip x265-/" with 10 episode files
  -> For each episode: copy_file to ${SERIES_DIR}/Maid (2021)/Season 01/Maid (2021) - s01eXX.mkv
  -> Check destination first and skip any that already exist.

IMPORTANT: If you are given the exact title and year from the database, use those values. Otherwise infer from the Clean name. NEVER delete the source. Call mark_complete at the end.`;

interface LogEntry {
  time: string;
  action: string;
  detail: string;
}

/**
 * POST /api/library/organize-folder
 * Organises a single folder/file from the torrents directory using AI.
 * - Copies (not moves) files so the original torrent folder is preserved for seeding.
 * - Skips files that already exist at the destination (safe to run multiple times / merge).
 * - Server-side lock prevents double-triggering if the button is clicked twice.
 * - If a matching DB record exists, updates its status so the Library tab stays in sync.
 *
 * Body: { folderName: string, downloadId?: string }
 *   folderName  - name of the folder/file inside ${TORRENTS_DIR}/
 *   downloadId  - optional DB record ID; if provided the record status is updated
 *                 so the Library tab reflects organising/organised state.
 */
/**
 * Copy a file using rsync --progress, calling onProgress with percentage updates.
 * Falls back to plain cp if rsync is unavailable.
 */
function copyFileWithProgress(
  src: string,
  dst: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("rsync", [
      "--progress",
      "--whole-file",
      src,
      dst,
    ]);

    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      // rsync progress lines look like: "  1,234,567  42%  12.34MB/s  0:00:05"
      const match = text.match(/(\d+)%/);
      if (match) {
        onProgress(parseInt(match[1], 10));
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `rsync exited with code ${code}`));
    });

    proc.on("error", () => {
      // rsync not available, fall back to cp
      execAsync(`cp ${shellEscape(src)} ${shellEscape(dst)}`)
        .then(() => resolve())
        .catch(reject);
    });
  });
}

export async function POST(req: NextRequest) {
  let folderName = "";
  let downloadId: string | undefined;

  try {
    const body = await req.json();
    folderName = body.folderName;
    downloadId = body.downloadId;

    if (!folderName || typeof folderName !== "string") {
      return NextResponse.json({ error: "folderName is required" }, { status: 400 });
    }

    if (inProgress.has(folderName)) {
      return NextResponse.json(
        { error: `"${folderName}" is already being organised. Please wait.`, alreadyRunning: true },
        { status: 409 }
      );
    }
    inProgress.add(folderName);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Stream logs to the client via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const addLog = (action: string, detail: string) => {
        const entry: LogEntry = { time: new Date().toISOString(), action, detail };
        sendEvent("log", entry);
      };

      // Run the organiser in the background so the stream stays open
      (async () => {
        try {
          const sourcePath = sanitizePath(`${TORRENTS_DIR}/${folderName}`);
          const cleanedName = cleanTorrentName(folderName);
          addLog("SCAN", `Organising: ${folderName}${cleanedName !== folderName ? ` (cleaned: ${cleanedName})` : ""}`);

          let dbRecord = downloadId
            ? db.select().from(download).where(eq(download.id, downloadId)).get()
            : db.select().from(download).where(eq(download.torrentName, folderName)).get();

          if (dbRecord && (dbRecord.status === "completed" || dbRecord.status === "failed")) {
            db.update(download)
              .set({ status: "organizing", updatedAt: new Date() })
              .where(eq(download.id, dbRecord.id))
              .run();
            dbRecord = db.select().from(download).where(eq(download.id, dbRecord.id)).get();
          }

          const dbHint = dbRecord
            ? `\n**Known title:** ${dbRecord.title}\n**Known year:** ${dbRecord.year || "Unknown"}\n**Type:** ${dbRecord.type}`
            : "";

          let existingMovies = "";
          let existingSeries = "";
          try {
            existingMovies = (await execAsync(`ls -1 ${shellEscape(MOVIES_DIR)} 2>/dev/null`)).stdout.trim();
          } catch { /* empty */ }
          try {
            existingSeries = (await execAsync(`ls -1 ${shellEscape(SERIES_DIR)} 2>/dev/null`)).stdout.trim();
          } catch { /* empty */ }

          let finalDestination = "";
          let summaryText = "";

          addLog("INFO", "AI is planning file organisation...");

          const result = await generateText({
            model: openai(organizeModel()),
            system: SYSTEM_PROMPT,
            prompt: `Please organise this item from the torrents folder:

**Source path:** ${sourcePath}
**Folder/file name:** ${folderName}
**Clean name (junk stripped):** ${cleanedName}${dbHint}
**Movies destination:** ${MOVIES_DIR}
**Series destination:** ${SERIES_DIR}

**Already in Movies/:**
${existingMovies || "(empty)"}

**Already in Series/:**
${existingSeries || "(empty)"}

Step 1: Call list_directory on the source path to see what files are inside. You MUST use the exact file paths from this output when copying.
Step 2: Decide if it is a movie or series based on the Clean name (or Known title if provided). Ignore any website domains in the folder name.
Step 3: Determine the destination folder path. Call delete_directory on it to wipe any previous attempt.
Step 4: Create the destination folder structure with create_directory.
Step 5: Copy each video/subtitle file using the EXACT source paths from step 1. Do NOT construct source paths yourself.
Step 6: Call mark_complete with a summary.`,
            tools: {
              list_directory: {
                description: `List all files and subfolders in a directory within ${STORAGE_ROOT}`,
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
              delete_directory: {
                description: `Delete a directory and all its contents within ${MOVIES_DIR} or ${SERIES_DIR}. Use this to wipe a previous destination folder before re-copying. NEVER use on source/torrent paths.`,
                inputSchema: zodSchema(z.object({
                  path: z.string().describe("Absolute path of directory to delete (must be inside Movies/ or Series/)"),
                })),
                execute: async ({ path: dirPath }: { path: string }) => {
                  const safePath = sanitizePath(dirPath);
                  if (!safePath.startsWith(MOVIES_DIR + "/") && !safePath.startsWith(SERIES_DIR + "/")) {
                    addLog("ERROR", `Refused to delete ${safePath} — only Movies/ and Series/ destinations allowed`);
                    return `Error: can only delete directories inside Movies/ or Series/`;
                  }
                  try {
                    await execAsync(`rm -rf ${shellEscape(safePath)}`);
                    addLog("DELETE", safePath);
                    return `Deleted: ${safePath}`;
                  } catch {
                    return `(directory did not exist or already deleted: ${safePath})`;
                  }
                },
              },
              create_directory: {
                description: `Create a directory (and all parents) within ${STORAGE_ROOT}`,
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
                description: `Copy a single file from source to destination within ${STORAGE_ROOT}. Preserves the original torrent folder for seeding.`,
                inputSchema: zodSchema(z.object({
                  source: z.string().describe("Absolute source file path"),
                  destination: z.string().describe("Absolute destination file path including the new filename"),
                })),
                execute: async ({ source, destination }: { source: string; destination: string }) => {
                  const safeSrc = sanitizePath(source);
                  const safeDst = sanitizePath(destination);
                  const fileName = path.basename(safeSrc);
                  const destFolder = path.basename(path.dirname(safeDst));
                  try {
                    // Get file size for progress context
                    let sizeLabel = "";
                    try {
                      const { stdout: sizeOut } = await execAsync(`stat -c%s ${shellEscape(safeSrc)}`);
                      const bytes = parseInt(sizeOut.trim(), 10);
                      if (bytes > 1024 * 1024 * 1024) sizeLabel = ` (${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB)`;
                      else if (bytes > 1024 * 1024) sizeLabel = ` (${(bytes / 1024 / 1024).toFixed(0)} MB)`;
                      else sizeLabel = ` (${(bytes / 1024).toFixed(0)} KB)`;
                    } catch { /* ignore */ }

                    addLog("COPY", `Copying ${fileName}${sizeLabel} → ${destFolder}/`);

                    let lastPct = -1;
                    await copyFileWithProgress(safeSrc, safeDst, (pct) => {
                      // Only log at 10% intervals to avoid spamming
                      const rounded = Math.floor(pct / 10) * 10;
                      if (rounded > lastPct) {
                        lastPct = rounded;
                        addLog("PROGRESS", `${fileName}: ${pct}%`);
                      }
                    });

                    addLog("DONE", `Copied ${fileName} → ${destFolder}/`);
                    return `Copied: ${safeSrc} -> ${safeDst}`;
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    addLog("ERROR", `Copy failed (${fileName}): ${msg}`);
                    return `Error copying: ${msg}`;
                  }
                },
              },
              mark_complete: {
                description: "Mark this folder organisation as complete. Call when all files have been processed.",
                inputSchema: zodSchema(z.object({
                  destinationPath: z.string().describe("The final destination root path (e.g. ${MOVIES_DIR}/MovieName (Year) or ${SERIES_DIR}/ShowName (Year))"),
                  summary: z.string().describe("Brief summary of what was done"),
                })),
                execute: async ({ destinationPath, summary }: { destinationPath: string; summary: string }) => {
                  finalDestination = destinationPath;
                  summaryText = summary;
                  addLog("COMPLETE", `${destinationPath}: ${summary}`);
                  return `Done: ${summary}`;
                },
              },
            },
            stopWhen: stepCountIs(25),
          });

          addLog("DONE", summaryText || result.text || "Organisation finished");

          if (dbRecord) {
            db.update(download)
              .set({
                status: "organized",
                destinationPath: finalDestination || null,
                updatedAt: new Date(),
              })
              .where(eq(download.id, dbRecord.id))
              .run();
          }

          sendEvent("complete", { destination: finalDestination, summary: summaryText || result.text });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addLog("ERROR", `Fatal error: ${msg}`);
          console.error("[Organize Folder] error:", err);

          if (downloadId) {
            try {
              db.update(download)
                .set({ status: "failed", errorMessage: msg, updatedAt: new Date() })
                .where(eq(download.id, downloadId))
                .run();
            } catch { /* best-effort */ }
          }

          sendEvent("error", { error: msg });
        } finally {
          inProgress.delete(folderName);
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * GET /api/library/organize-folder?folder=FolderName
 * Returns whether a given folder is currently being organised.
 * Used by the UI to restore in-progress state after navigation.
 */
export async function GET(req: NextRequest) {
  const folder = new URL(req.url).searchParams.get("folder");
  if (!folder) {
    return NextResponse.json({ inProgress: [...inProgress] });
  }
  return NextResponse.json({ inProgress: inProgress.has(folder) });
}
