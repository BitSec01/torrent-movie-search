import { tmdbApiKey } from "@/lib/config";
import { MetadataSourceError } from "./errors";
import type {
  TmdbSearchHit,
  TmdbSearchHitResponse,
  TmdbExternalIds,
  TmdbFindResponse,
  TmdbSearchItem,
  TmdbSearchResponse,
  TmdbTitleDetail,
  TmdbCredits,
  TmdbDetail,
} from "./types";

const BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w500";

/** How many search hits we resolve to IMDb ids. Each resolution is one extra
 *  request, and the grid only shows a page at a time, so there is no point
 *  resolving the long tail. */
const SEARCH_RESOLVE_LIMIT = 20;

/** Certification bodies in preference order. This is an Australian library, so
 *  an AU rating is the meaningful one; US is the near-universal fallback. */
const CERTIFICATION_REGIONS = ["AU", "US", "GB"];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export class TmdbError extends MetadataSourceError {
  constructor(message: string, reason: "invalid-key" | "rate-limited" | "unknown") {
    super("Tmdb", message, reason);
  }
}

export function tmdbConfigured(): boolean {
  return tmdbApiKey().length > 0;
}

function posterUrl(path?: string | null): string | null {
  return path ? `${IMG_BASE}${path}` : null;
}

function yearOf(item: { release_date?: string; first_air_date?: string }): string {
  return (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
}

function ratingOf(voteAverage?: number): string | undefined {
  return typeof voteAverage === "number" && voteAverage > 0 ? voteAverage.toFixed(1) : undefined;
}

/** OMDb renders dates as "16 Jul 2010"; matching it keeps the detail panel
 *  consistent regardless of which source answered. Hand-rolled rather than
 *  toLocaleDateString because ICU abbreviates some months differently across
 *  Node builds. */
function formatDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [year, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  if (!year || !name || !day) return undefined;
  return `${day} ${name} ${year}`;
}

function joinNames(items: { name: string }[] | undefined, limit: number): string | undefined {
  const names = (items ?? []).slice(0, limit).map((i) => i.name);
  return names.length > 0 ? names.join(", ") : undefined;
}

function crewByJob(credits: TmdbCredits | undefined, jobs: string[], limit: number) {
  const seen = new Set<string>();
  const names = (credits?.crew ?? [])
    .filter((c) => c.job && jobs.includes(c.job))
    .map((c) => c.name)
    .filter((name) => !seen.has(name) && seen.add(name));
  return names.length > 0 ? names.slice(0, limit).join(", ") : undefined;
}

function certificationOf(detail: TmdbTitleDetail): string | undefined {
  for (const region of CERTIFICATION_REGIONS) {
    const tv = detail.content_ratings?.results?.find((r) => r.iso_3166_1 === region)?.rating;
    if (tv) return tv;

    const movie = detail.release_dates?.results
      ?.find((r) => r.iso_3166_1 === region)
      ?.release_dates?.map((d) => d.certification)
      .find((c) => c);
    if (movie) return movie;
  }
  return undefined;
}

function runtimeOf(detail: TmdbTitleDetail): string | undefined {
  const minutes = detail.runtime ?? detail.episode_run_time?.[0];
  return minutes ? `${minutes} min` : undefined;
}

function moneyOf(amount?: number): string | undefined {
  return amount && amount > 0 ? `$${amount.toLocaleString("en-US")}` : undefined;
}

function classify(status: number, message: string): TmdbError {
  if (status === 401 || status === 403) {
    return new TmdbError(
      `${message} Check TMDB_API_KEY — TMDB accepts either the v3 API key or the v4 read access token.`,
      "invalid-key"
    );
  }
  if (status === 429) {
    return new TmdbError(`${message} TMDB is throttling this key.`, "rate-limited");
  }
  return new TmdbError(message, "unknown");
}

/**
 * TMDB accepts two credentials: the classic v3 key goes in the query string,
 * while a v4 read-access token is a JWT that goes in the Authorization header.
 * Supporting both means a pasted token works whichever kind the user copied.
 */
async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
  revalidate = 300
): Promise<T> {
  const key = tmdbApiKey();
  const isJwt = key.startsWith("eyJ");
  const search = new URLSearchParams(params);
  if (!isJwt) search.set("api_key", key);

  const res = await fetch(`${BASE}${path}?${search}`, {
    ...(isJwt ? { headers: { Authorization: `Bearer ${key}` } } : {}),
    next: { revalidate },
  });

  if (!res.ok) {
    // A 404 is an ordinary miss (unknown id), not a source failure.
    if (res.status === 404) throw new Error(`TMDB ${path}: not found`);
    throw classify(res.status, `TMDB ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function imdbIdFor(mediaType: "movie" | "tv", tmdbId: number): Promise<string | null> {
  const ext = await tmdbFetch<TmdbExternalIds>(`/${mediaType}/${tmdbId}/external_ids`, {}, 86400);
  return ext.imdb_id ?? null;
}

function mediaTypeOf(hit: TmdbSearchHit, fallback?: "movie" | "tv"): "movie" | "tv" | null {
  if (hit.media_type === "movie" || hit.media_type === "tv") return hit.media_type;
  return fallback ?? null;
}

/**
 * Search, then map each hit to its IMDb id so results key against the same id
 * the download table, detail route and torrent matcher all use. Hits without an
 * IMDb id are dropped — a card with no IMDb id can neither open its detail page
 * nor be recorded against a download.
 *
 * The per-hit external_ids lookups are cached for a day: an id mapping never
 * changes, and repeat searches are the common case.
 */
export async function searchTmdb(
  query: string,
  options?: { type?: string; year?: string; page?: number }
): Promise<TmdbSearchResponse> {
  const page = String(options?.page ?? 1);
  const wantsSeries = options?.type === "series";
  const wantsMovie = options?.type === "movie";

  // /search/multi cannot filter by year, so a typed search uses the dedicated
  // endpoint (which can) and an untyped one filters after the fact.
  const [path, params, fallbackType]: [string, Record<string, string>, "movie" | "tv" | undefined] =
    wantsSeries
      ? ["/search/tv", options?.year ? { first_air_date_year: options.year } : {}, "tv"]
      : wantsMovie
        ? ["/search/movie", options?.year ? { primary_release_year: options.year } : {}, "movie"]
        : ["/search/multi", {}, undefined];

  const data = await tmdbFetch<TmdbSearchHitResponse>(path, {
    ...params,
    query,
    page,
    include_adult: "false",
  });

  const candidates = (data.results ?? [])
    .filter((hit) => mediaTypeOf(hit, fallbackType) !== null)
    .filter((hit) => !options?.year || fallbackType !== undefined || yearOf(hit) === options.year)
    .slice(0, SEARCH_RESOLVE_LIMIT);

  const resolved = await Promise.all(
    candidates.map(async (hit): Promise<TmdbSearchItem | null> => {
      const mediaType = mediaTypeOf(hit, fallbackType)!;
      const imdbId = await imdbIdFor(mediaType, hit.id).catch(() => null);
      if (!imdbId) return null;
      return {
        imdbId,
        title: (hit.title ?? hit.name ?? "").trim(),
        year: yearOf(hit),
        type: mediaType === "tv" ? "series" : "movie",
        poster: posterUrl(hit.poster_path),
        plot: hit.overview || undefined,
      };
    })
  );

  return {
    items: resolved.filter((x): x is TmdbSearchItem => x !== null && x.title.length > 0),
    totalResults: data.total_results ?? 0,
  };
}

function toDetail(
  imdbId: string,
  mediaType: "movie" | "tv",
  raw: TmdbTitleDetail
): TmdbDetail {
  const credits = raw.credits ?? raw.aggregate_credits;
  const isTv = mediaType === "tv";

  return {
    imdbId,
    title: (raw.title ?? raw.name ?? "").trim(),
    year: yearOf(raw),
    type: isTv ? "series" : "movie",
    poster: posterUrl(raw.poster_path),
    plot: raw.overview || undefined,
    rating: ratingOf(raw.vote_average),
    votes: raw.vote_count ? raw.vote_count.toLocaleString("en-US") : undefined,
    runtime: runtimeOf(raw),
    genres: (raw.genres ?? []).map((g) => g.name),
    // TV has no director; its showrunner is the equivalent credit.
    director: isTv
      ? joinNames(raw.created_by, 3)
      : crewByJob(credits, ["Director"], 3),
    writer: crewByJob(credits, ["Writer", "Screenplay", "Story"], 3),
    actors: joinNames(credits?.cast, 4),
    language: joinNames(
      (raw.spoken_languages ?? [])
        .map((l) => ({ name: l.english_name ?? l.name ?? "" }))
        .filter((l) => l.name),
      3
    ),
    country: joinNames(raw.production_countries, 3),
    released: formatDate(raw.release_date ?? raw.first_air_date),
    rated: certificationOf(raw),
    boxOffice: moneyOf(raw.revenue),
    totalSeasons: raw.number_of_seasons ? String(raw.number_of_seasons) : undefined,
  };
}

/**
 * Resolve a title from its IMDb id. /find maps the id to TMDB's own id and tells
 * us whether it is a movie or a series; the detail call then pulls credits and
 * certification in the same request via append_to_response.
 */
export async function getTmdbDetailByImdb(imdbId: string): Promise<TmdbDetail | null> {
  const found = await tmdbFetch<TmdbFindResponse>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });

  const movie = found.movie_results?.[0];
  const tv = found.tv_results?.[0];
  const hit = movie ?? tv;
  if (!hit) return null;

  const mediaType: "movie" | "tv" = movie ? "movie" : "tv";
  const appends =
    mediaType === "movie" ? "credits,release_dates" : "aggregate_credits,content_ratings";

  const raw = await tmdbFetch<TmdbTitleDetail>(
    `/${mediaType}/${hit.id}`,
    { append_to_response: appends },
    600
  ).catch(() => null);

  // The find hit alone still carries title, year, poster and plot, which is
  // enough for a usable panel if the detail call is the thing that failed.
  return raw ? toDetail(imdbId, mediaType, raw) : toDetail(imdbId, mediaType, hit);
}
