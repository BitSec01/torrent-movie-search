/**
 * Turns a completed torrent folder into a structured, validated copy plan.
 *
 * The model never touches the filesystem here — it only fills in a schema, and
 * execute.ts carries the plan out deterministically. Keeping the two apart is
 * what makes unattended organising safe enough to run on a timer.
 */

import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { readdir } from "node:fs/promises";
import { moviesDir, organizeModel, seriesDir, torrentsDir } from "@/lib/config";
import { sanitizePath, shellEscape } from "./paths";
import { normalizePlan, type LibraryFolders } from "./normalize-plan";
import { cleanTitle, declaredSeasons } from "./title";
import type { PlanResult } from "./types";

const execAsync = promisify(exec);

const TORRENTS_DIR = torrentsDir();

export const DEST_BASES = [moviesDir(), seriesDir()] as const;

function cleanTorrentName(raw: string): string {
  let name = raw;
  name = name.replace(/^www\.[a-z0-9-]+\.[a-z]{2,}[\s.\-–—]+/i, "");
  name = name.replace(/^[\[(][a-z0-9._ -]+[\])]\s*/i, "");
  name = name.replace(/^[a-z0-9-]+\.(com|org|net|io|to|cc|me|info)[\s.\-–—]+/i, "");
  return name.trim() || raw;
}

/** Strip www prefixes, bracket groups and separators so names compare fuzzily */
export function normalizeName(name: string): string {
  return name
    .replace(/^www\.[a-z0-9.-]+\s*[-–—]+\s*/i, "")
    .replace(/\[.*?\]/g, " ")
    .replace(/\./g, " ")
    .replace(/[_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The DB's torrent_name often differs from the real entry on disk (dots vs
 * spaces, www prefixes, [YTS.MX] suffixes), so fall back through progressively
 * looser matches before giving up.
 */
export async function resolveActualEntry(folderName: string): Promise<string | null> {
  let entries: string[] = [];
  try {
    const { stdout } = await execAsync(`ls -1 ${shellEscape(TORRENTS_DIR)} 2>/dev/null`);
    entries = stdout.trim().split("\n").filter(Boolean);
  } catch {
    return null;
  }

  if (entries.length === 0) return null;

  if (entries.includes(folderName)) return folderName;

  const lower = folderName.toLowerCase();
  const ci = entries.find((e) => e.toLowerCase() === lower);
  if (ci) return ci;

  // "The Chosen Season 5" and "The Chosen Season 1 to 4" share every word the
  // fuzzy pass scores on, so without this the looser matches below resolve one
  // to the other and organise 49 GB of the wrong seasons a second time.
  const wanted = declaredSeasons(folderName);
  if (wanted.length > 0) {
    entries = entries.filter((e) => {
      const has = declaredSeasons(e);
      return has.length === 0 || has.some((s) => wanted.includes(s));
    });
    if (entries.length === 0) return null;
  }

  const normTarget = normalizeName(folderName);
  const normExact = entries.find((e) => normalizeName(e) === normTarget);
  if (normExact) return normExact;

  const prefixMatch = entries.find((e) => {
    const ne = normalizeName(e);
    return ne.startsWith(normTarget) || normTarget.startsWith(ne);
  });
  if (prefixMatch) return prefixMatch;

  // At least 60% of significant words from the target appear in the candidate
  const words = normTarget.split(" ").filter((w) => w.length > 2);
  if (words.length >= 2) {
    const scored = entries.map((e) => {
      const ne = normalizeName(e);
      const hits = words.filter((w) => ne.includes(w)).length;
      return { e, score: hits / words.length };
    });
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score >= 0.6) return scored[0].e;
  }

  return null;
}

const folderPlanSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  destinationBase: z.enum(DEST_BASES),
  rootFolder: z
    .string()
    .describe('Destination root folder name, e.g. "Billions (2016)" or "War Machine (2026)"'),
  metadata: z.object({
    title: z.string(),
    year: z.string().nullable(),
  }),
  operations: z.array(
    z.object({
      sourceAbsPath: z
        .string()
        .describe("Exact absolute path from the file listing — copy character-for-character"),
      destRelPath: z
        .string()
        .describe(
          'Path relative to rootFolder, e.g. "Season 01/Billions (2016) - s01e01.mkv" or "War Machine (2026).mkv"'
        ),
    })
  ),
});

const SYSTEM_PROMPT = `You are a Plex media library organizer. Given a list of files from a torrent download, produce a JSON plan to organize them into the correct Plex-compatible structure.

NAMING THE DESTINATION FOLDER — this is the part that matters most:
- rootFolder is the name of the WORK, never the name of the release. Use your own knowledge of the film or show to recognise the real title behind a torrent name.
- Format: "Title (Year)". Nothing else belongs in it — no season number, no resolution, no source, no codec, no audio tag, no release group, no "Complete", no "Batch".
  - "Ugly Betty Season 3 Complete 720p AMZN WEBRip x264" → rootFolder "Ugly Betty (2006)"
  - "The Chosen - Season 5 - Mp4 x264 AC3 1080p" → rootFolder "The Chosen (2017)"
- Every season of a show shares ONE rootFolder. Seasons are subfolders inside it, never sibling folders next to it.
- Year for a series is the year the SHOW first aired, not the year of this season, and always a single four-digit year — never a range like "2017–2022" and never "Unknown". Omit the year entirely if you do not know it.
- Punctuation in the title must match the real title exactly and consistently ("Schmigadoon!"), because a variant spelling creates a second folder.
- If the "Existing library folders" list contains this show under any spelling, reuse that exact folder name.

Rules:
- Movies → ${DEST_BASES[0]}. destRelPath: "Title (Year).ext" — flat, no subfolder.
- TV Series → ${DEST_BASES[1]}. destRelPath: "Season 01/Show Name (Year) - s01e01.ext"
- The season folder must match the episode's own season: an s03e13 episode goes in "Season 03", never in "Season 01".
- Anime numbered absolutely ("Show - 55.mkv") still gets sNNeMM: use your knowledge of the show's season lengths to work out which season and episode that is.
- Keep ONLY: video files (.mkv .mp4 .avi .m4v .wmv) and subtitle files (.srt .sub .ass .ssa .vtt .smi)
- Exclude everything else: .nfo .txt .jpg .jpeg .png .sfv .md5 .exe .dll .torrent .url and filenames containing "sample"
- For subtitles: detect language from folder/filename (e.g. "English" → .en, "French" → .fr, "Dutch" → .nl, "Spanish" → .es). Default to .en if language is unknown
- Always use two-digit padding: Season 01, s01e01
- sourceAbsPath must be copied EXACTLY from the provided file listing — never modify or reconstruct source paths
- The DB title and year are hints taken from whatever the user was shown when they queued the download. They are frequently a raw torrent name — read the real title out of them rather than copying them verbatim.`;

export interface PlanRequest {
  folderName: string;
  downloadId?: string;
}

async function listFiles(absPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `find ${shellEscape(absPath)} -type f 2>/dev/null | sort | head -500`
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

async function listDirNames(base: string): Promise<string[]> {
  try {
    const entries = await readdir(base, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Folder names already in the library, so a show is filed where it already lives */
async function listLibraryFolders(): Promise<LibraryFolders> {
  const [movies, series] = await Promise.all(DEST_BASES.map(listDirNames));
  return { movies, series };
}

function describeLibrary({ movies, series }: LibraryFolders): string {
  const sections = [
    series.length ? `Existing Series folders:\n${series.join("\n")}` : "",
    movies.length ? `Existing Movies folders:\n${movies.join("\n")}` : "",
  ].filter(Boolean);

  if (sections.length === 0) return "";
  return `\nReuse one of these folder names verbatim if this download belongs to it:\n\n${sections.join("\n\n")}\n`;
}

export async function planFolder({ folderName, downloadId }: PlanRequest): Promise<PlanResult> {
  let sourcePath: string;
  try {
    sourcePath = sanitizePath(`${TORRENTS_DIR}/${folderName}`);
  } catch {
    return { folderName, downloadId, error: "Invalid folder name" };
  }

  let resolvedName = folderName;
  let fileListing = await listFiles(sourcePath);

  if (!fileListing) {
    const matched = await resolveActualEntry(folderName);
    if (matched) {
      resolvedName = matched;
      fileListing = await listFiles(sanitizePath(`${TORRENTS_DIR}/${matched}`));
    }
  }

  if (!fileListing) {
    return { folderName, downloadId, error: `Source folder not found in ${TORRENTS_DIR}/` };
  }

  const cleanedName = cleanTorrentName(resolvedName);

  const record = downloadId
    ? db.select().from(download).where(eq(download.id, downloadId)).get()
    : undefined;

  const dbHint = record
    ? `\nDB title: ${record.title}\nDB year: ${record.year ?? "unknown"}\nDB type: ${record.type}`
    : "";

  const existingFolders = await listLibraryFolders();
  const libraryHint = describeLibrary(existingFolders);

  try {
    const { object } = await generateObject({
      model: openai(organizeModel()),
      schema: folderPlanSchema,
      system: SYSTEM_PROMPT,
      prompt: `Torrent folder: ${resolvedName}
Clean name: ${cleanedName}
Likely title: ${cleanTitle(resolvedName)}${dbHint}${libraryHint}

Files:
${fileListing}`,
    });

    const normalized = normalizePlan(object, {
      existingFolders,
      releaseName: resolvedName,
      dbTitle: record?.title,
      dbYear: record?.year,
    });

    return { folderName, downloadId, ...normalized };
  } catch (err) {
    return { folderName, downloadId, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function planFolders(items: PlanRequest[]): Promise<PlanResult[]> {
  return Promise.all(items.map(planFolder));
}
