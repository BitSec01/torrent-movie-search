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
import { moviesDir, organizeModel, seriesDir, storageRoot, torrentsDir } from "@/lib/config";
import type { PlanResult } from "./types";

const execAsync = promisify(exec);

const STORAGE_ROOT = storageRoot();
const TORRENTS_DIR = torrentsDir();

export const DEST_BASES = [moviesDir(), seriesDir()] as const;

export function sanitizePath(p: string): string {
  const resolved = p.replace(/\/+/g, "/").replace(/\.\./g, "");
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error("Path outside allowed storage root");
  }
  return resolved;
}

export function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

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

Rules:
- Movies → ${DEST_BASES[0]}. rootFolder: "Title (Year)". destRelPath: "Title (Year).ext"
- TV Series → ${DEST_BASES[1]}. rootFolder: "Show Name (Year)". destRelPath: "Season 01/Show Name (Year) - s01e01.ext"
- Keep ONLY: video files (.mkv .mp4 .avi .m4v .wmv) and subtitle files (.srt .sub .ass .ssa .vtt .smi)
- Exclude everything else: .nfo .txt .jpg .jpeg .png .sfv .md5 .exe .dll .torrent .url and filenames containing "sample"
- Strip from filenames: quality tags (720p 1080p 2160p 4K BluRay BrRip WEBRip WEB-DL HDTV), codecs (x264 x265 HEVC AVC), audio tags (AAC DDP5.1 Atmos), release groups (YIFY RARBG etc)
- For subtitles: detect language from folder/filename (e.g. "English" → .en, "French" → .fr, "Dutch" → .nl, "Spanish" → .es). Default to .en if language is unknown
- Always use two-digit padding: Season 01, s01e01
- sourceAbsPath must be copied EXACTLY from the provided file listing — never modify or reconstruct source paths
- If DB title/year is provided, use those exact values in rootFolder and all filenames`;

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

  let dbHint = "";
  if (downloadId) {
    const record = db.select().from(download).where(eq(download.id, downloadId)).get();
    if (record) {
      dbHint = `\nDB title: ${record.title}\nDB year: ${record.year ?? "unknown"}\nDB type: ${record.type}`;
    }
  }

  try {
    const { object } = await generateObject({
      model: openai(organizeModel()),
      schema: folderPlanSchema,
      system: SYSTEM_PROMPT,
      prompt: `Torrent folder: ${resolvedName}
Clean name: ${cleanedName}${dbHint}

Files:
${fileListing}`,
    });

    return { folderName, downloadId, ...object };
  } catch (err) {
    return { folderName, downloadId, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function planFolders(items: PlanRequest[]): Promise<PlanResult[]> {
  return Promise.all(items.map(planFolder));
}
