/**
 * Corrects a model-produced plan before anything touches the filesystem.
 *
 * The model decides *what* a download is; this decides what the library calls
 * it. Three failures kept reaching disk and each is fixed here rather than by
 * asking the model again:
 *
 *  - a release name used as a folder name ("Ugly Betty Season 1 Complete 720p
 *    AMZN WEBRip x264 (2006)"), which files every season separately
 *  - a folder that already exists under a punctuation or year variant
 *    ("Schmigadoon!" vs "Schmigadoon"), which forks one show into two
 *  - an "s03e13" episode filed under "Season 01", which Plex reads as season 1
 */

import path from "node:path";
import { moviesDir, seriesDir } from "@/lib/config";
import {
  cleanTitle,
  libraryFolderName,
  libraryKey,
  looksLikeReleaseName,
  pad2,
  parseSeasonEpisode,
  startYear,
  stripYear,
  yearFromReleaseName,
} from "./title";
import type { FileOperation } from "./types";

/** The shape the planner's schema produces, before it becomes a FolderPlan */
export interface RawPlan {
  mediaType: "movie" | "series";
  destinationBase: string;
  rootFolder: string;
  metadata: { title: string; year: string | null };
  operations: FileOperation[];
}

/** Folder names already present under each destination base */
export interface LibraryFolders {
  movies: string[];
  series: string[];
}

export interface NormalizeContext {
  existingFolders: LibraryFolders;
  /** The torrent folder on disk, the one hint that is never invented */
  releaseName: string;
  dbTitle?: string | null;
  dbYear?: string | null;
}

const SUBTITLE_EXTENSIONS = new Set([".srt", ".sub", ".ass", ".ssa", ".vtt", ".smi"]);

/** ".en" from "Show (2011) - s01e02.en.srt", so a language tag survives renaming */
function languageSuffix(fileName: string): string {
  const ext = path.extname(fileName);
  if (!SUBTITLE_EXTENSIONS.has(ext.toLowerCase())) return "";
  const lang = path.basename(fileName, ext).match(/\.([a-z]{2,3})$/i);
  return lang ? `.${lang[1].toLowerCase()}` : "";
}

/**
 * The title the library should file this under.
 *
 * The model's own answer wins whenever it is a plausible title — over-cleaning
 * a real one ("Complete Unknown") costs more than leaving a rare oddity alone.
 * It is only overridden when it still carries release metadata, which is
 * exactly the case the model gets wrong.
 */
function resolveTitle(plan: RawPlan, ctx: NormalizeContext): string {
  const candidates = [plan.rootFolder, plan.metadata?.title, ctx.dbTitle, ctx.releaseName];

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    const base = stripYear(candidate.trim());
    if (!looksLikeReleaseName(base)) return base;
  }

  for (const candidate of candidates) {
    const cleaned = cleanTitle(candidate ?? "");
    if (cleaned) return stripYear(cleaned);
  }

  return ctx.releaseName;
}

function resolveYear(plan: RawPlan, ctx: NormalizeContext): string | null {
  return (
    startYear(plan.metadata?.year) ??
    startYear(plan.rootFolder.match(/\((19|20)\d{2}/)?.[0]) ??
    startYear(ctx.dbYear) ??
    yearFromReleaseName(ctx.releaseName)
  );
}

/**
 * Reuse the folder this show already lives in.
 *
 * Only a folder that is itself a clean title is adopted — merging into an
 * existing junk name would spread the mistake rather than stop it.
 */
function reconcileWithLibrary(rootFolder: string, existingFolders: string[]): string {
  if (existingFolders.includes(rootFolder)) return rootFolder;

  const key = libraryKey(rootFolder);
  if (!key) return rootFolder;

  const match = existingFolders.find((f) => libraryKey(f) === key && !looksLikeReleaseName(f));
  return match ?? rootFolder;
}

function rewriteOperations(
  operations: FileOperation[],
  rootFolder: string,
  isSeries: boolean
): FileOperation[] {
  const taken = new Set<string>();

  return operations.map((op) => {
    const original = op.destRelPath;
    const fileName = path.basename(original);
    const ext = path.extname(fileName);
    const lang = languageSuffix(fileName);

    let rewritten = original;

    if (isSeries) {
      const se = parseSeasonEpisode(fileName) ?? parseSeasonEpisode(op.sourceAbsPath);
      if (se) {
        const tag = `s${pad2(se.season)}e${pad2(se.episode)}`;
        rewritten = `Season ${pad2(se.season)}/${rootFolder} - ${tag}${lang}${ext}`;
      }
    } else if (ext) {
      rewritten = `${rootFolder}${lang}${ext}`;
    }

    // A rename that would land on a path already claimed loses to the model's
    // own layout — two files silently becoming one is worse than an odd name.
    const destRelPath = taken.has(rewritten) ? original : rewritten;
    taken.add(destRelPath);
    return { ...op, destRelPath };
  });
}

export function normalizePlan(plan: RawPlan, ctx: NormalizeContext): RawPlan {
  // Episode numbering in the files themselves outranks the model's label: a
  // download it called a movie but numbered s01e01 is a series.
  const numbered = plan.operations.some(
    (op) => parseSeasonEpisode(path.basename(op.destRelPath)) ?? parseSeasonEpisode(op.sourceAbsPath)
  );
  const isSeries = numbered || plan.mediaType === "series";

  const title = resolveTitle(plan, ctx);
  const year = resolveYear(plan, ctx);
  const siblings = isSeries ? ctx.existingFolders.series : ctx.existingFolders.movies;
  const rootFolder = reconcileWithLibrary(libraryFolderName(title, year), siblings);

  return {
    ...plan,
    mediaType: isSeries ? "series" : "movie",
    destinationBase: isSeries ? seriesDir() : moviesDir(),
    rootFolder,
    metadata: { title: stripYear(cleanTitle(title)) || title, year },
    operations: rewriteOperations(plan.operations, rootFolder, isSeries),
  };
}
