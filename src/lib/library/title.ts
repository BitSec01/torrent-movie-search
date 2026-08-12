/**
 * Deterministic release-name parsing, and the identity a library folder is
 * matched on.
 *
 * The organiser's model is good at reading a file listing and bad at resisting
 * a junk hint: given a DB title of "Ugly Betty Season 1 Complete 720p AMZN
 * WEBRip x264" it names the destination folder after it, and the next season
 * lands beside that folder rather than inside it. Everything here exists so the
 * model's answer can be checked — and, where it is plainly a release name
 * rather than a title, corrected without another round trip.
 */

/**
 * Tokens that only appear once release metadata has started. The first one
 * found ends the title: everything from there describes the encode, not the
 * work.
 */
const STOP_TOKENS = [
  // Season and episode markers
  /^s\d{1,2}(e\d{1,3})?$/i,
  /^s\d{1,2}-s?\d{1,2}$/i,
  /^seasons?$/i,
  /^complete$/i,
  /^batch$/i,
  /^episodes?$/i,
  // Resolution and source
  /^\d{3,4}p$/i,
  /^(4k|uhd|hdr|hdr10|dovi|imax|remastered|proper|repack|extended|unrated|limited|internal)$/i,
  /^(bluray|blu-ray|brrip|bdrip|bd|webrip|web-dl|webdl|web|hdtv|dvdrip|dvdr|dvd|hdrip|cam|pal|ntsc)$/i,
  /^(amzn|nf|netflix|atvp|dsnp|hulu|hmax|iplayer|stan|pcok)$/i,
  // Codecs and audio
  /^(x264|x265|h264|h265|h\.264|h\.265|hevc|avc|av1|xvid|divx|10bit|10-bit|8bit)$/i,
  /^(aac|ac3|eac3|dts|dts-hd|ddp|ddp?5|dd\+|dd5|atmos|flac|mp3|opus|truehd)$/i,
  /^(dual|multi|multi\d|subs?|subbed|dubbed|vostfr)$/i,
  /^(mp4|mkv|avi)$/i,
];

const BRACKET_GROUP = /[[({][^\])}]*[\])}]/g;

const YEAR_IN_BRACKETS = /[[({]\s*((?:19|20)\d{2})\s*(?:[-–—]\s*(?:19|20)?\d{0,4})?\s*[\])}]/;

const MEDIA_EXTENSION = /\.(mkv|mp4|avi|m4v|wmv|srt|sub|ass|ssa|vtt|smi)$/i;

/** A bare four-digit number is only a year when it could plausibly be one — a
 *  ceiling keeps "Blade Runner 2049" a title rather than a title and a year. */
const MAX_PLAUSIBLE_YEAR = new Date().getFullYear() + 2;

function isYearToken(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token) && Number(token) <= MAX_PLAUSIBLE_YEAR;
}

function isStopToken(token: string): boolean {
  return STOP_TOKENS.some((re) => re.test(token));
}

/** Strip tracker prefixes that sit in front of the real name */
function stripSitePrefix(name: string): string {
  return name
    .replace(/^www\.[a-z0-9-]+\.[a-z]{2,}[\s.\-–—]+/i, "")
    .replace(/^[a-z0-9-]+\.(com|org|net|io|to|cc|me|info)[\s.\-–—]+/i, "")
    .replace(/^\s*[[(][^\])]*[\])]\s*/, "")
    .trim();
}

/**
 * Dotted release names ("Clarksons.Farm.S05.1080p") use dots as separators;
 * spaced ones use dots inside the title ("Mrs. Doubtfire"). Only a name with no
 * spaces of its own is treated as dot-separated.
 */
function normalizeSeparators(name: string): string {
  if (!name.includes(" ") && name.includes(".")) return name.replace(/\./g, " ");
  return name.replace(/_/g, " ");
}

/**
 * The title a release name is for, with every encode detail removed.
 *
 * "Ugly Betty Season 1 Complete 720p AMZN WEBRip x264" -> "Ugly Betty"
 * "Schmigadoon! (2021) Season 1 S01 (1080p ATVP WEB-DL)" -> "Schmigadoon!"
 */
export function cleanTitle(raw: string): string {
  if (!raw) return "";

  const stripped = stripSitePrefix(raw.trim()).replace(MEDIA_EXTENSION, "");
  const name = normalizeSeparators(stripped).replace(BRACKET_GROUP, " ");

  const kept: string[] = [];
  for (const token of name.split(/\s+/).filter(Boolean)) {
    const bare = token.replace(/^[-–—,]+|[-–—,]+$/g, "");
    if (!bare) continue;
    // A leading year is part of the title ("1917", "2012"), not a release year
    if (kept.length > 0 && (isStopToken(bare) || isYearToken(bare))) break;
    kept.push(token);
  }

  const title = kept
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/[\s,;:]*[-–—]+\s*$/, "")
    .replace(/[\s,;:]+$/, "")
    .trim();

  return title || stripped.trim();
}

/**
 * The release year as a single four-digit value. Metadata sources report a
 * series as a run ("1985–1992", "2017–"), which Plex does not want in a folder
 * name and which forks one show into two the moment the run gains an end date.
 */
export function startYear(raw?: string | null): string | null {
  const match = raw ? String(raw).match(/(19|20)\d{2}/) : null;
  return match ? match[0] : null;
}

/** The year a release name carries, whether bracketed or bare */
export function yearFromReleaseName(raw: string): string | null {
  const bracketed = raw.match(YEAR_IN_BRACKETS);
  if (bracketed) return bracketed[1];

  const name = normalizeSeparators(stripSitePrefix(raw)).replace(BRACKET_GROUP, " ");
  const tokens = name.split(/\s+/).filter(Boolean);
  return tokens.slice(1).find(isYearToken) ?? null;
}

/** "Ugly Betty (2006)" -> "Ugly Betty" */
export function stripYear(name: string): string {
  return name
    .replace(/\s*[[(]\s*(19|20)\d{2}\s*(?:[-–—]\s*(?:19|20)?\d{0,4})?\s*[\])]\s*$/, "")
    .trim();
}

/**
 * The identity two folder names are considered the same show by.
 *
 * Punctuation is dropped, so "Schmigadoon!" and "Schmigadoon" are one show, as
 * are "Clarkson's Farm" and "Clarksons Farm". The year goes too: the same show
 * reached through two sources routinely disagrees on it, and a disagreement
 * should never fork the library.
 */
export function libraryKey(name: string): string {
  return cleanTitle(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    // Dropped rather than separated: "Clarkson's Farm" and "Clarksons Farm" are
    // one show, and a space would make them two.
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a name still carries release metadata rather than being a title */
export function looksLikeReleaseName(name: string): boolean {
  const base = stripYear(name.trim());
  return cleanTitle(base) !== base;
}

export interface SeasonEpisode {
  season: number;
  episode: number;
}

/**
 * The season and episode a filename refers to.
 *
 * Read from the name rather than trusted from the plan: the model has filed an
 * "s03e13" episode under "Season 01" often enough that the folder it chose is
 * the less reliable of the two.
 */
export function parseSeasonEpisode(name: string): SeasonEpisode | null {
  const patterns = [
    /\bs(\d{1,2})[\s._-]*e(\d{1,3})\b/i,
    /\b(\d{1,2})x(\d{1,3})\b/i,
    /\bseason[\s._-]*(\d{1,2})[\s._-]*episode[\s._-]*(\d{1,3})\b/i,
  ];

  for (const re of patterns) {
    const m = name.match(re);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  }
  return null;
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

const SEASON_RANGE = [
  /\bs(\d{1,2})\s*[-–—]\s*s?(\d{1,2})\b/gi,
  /\bseasons?\s*(\d{1,2})\s*(?:to|thru|through|[-–—])\s*(\d{1,2})\b/gi,
];

const SEASON_SINGLE = [/\bseasons?\s*(\d{1,2})\b/gi, /\bs(\d{2})(?:e\d{1,3})?\b/gi];

/**
 * Which seasons a release name says it contains.
 *
 * Used to keep "The Chosen Season 5" from being resolved to the folder holding
 * "The Chosen Season 1 to 4": they share every word that matters to a fuzzy
 * match, and the only thing telling them apart is the number.
 */
export function declaredSeasons(name: string): number[] {
  const found = new Set<number>();

  for (const re of SEASON_RANGE) {
    for (const m of name.matchAll(re)) {
      const [from, to] = [Number(m[1]), Number(m[2])];
      if (from <= to) for (let s = from; s <= to; s++) found.add(s);
    }
  }

  if (found.size === 0) {
    for (const re of SEASON_SINGLE) {
      for (const m of name.matchAll(re)) found.add(Number(m[1]));
    }
  }

  return [...found].sort((a, b) => a - b);
}

/** "Ugly Betty" + "2006" -> "Ugly Betty (2006)" */
export function libraryFolderName(title: string, year?: string | null): string {
  const cleaned = stripYear(cleanTitle(title)) || title.trim();
  const y = startYear(year);
  return y ? `${cleaned} (${y})` : cleaned;
}
