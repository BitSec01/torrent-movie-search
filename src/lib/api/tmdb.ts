import { tmdbApiKey } from "@/lib/config";
import type {
  TmdbMultiResponse,
  TmdbExternalIds,
  TmdbFindResponse,
  TmdbFindItem,
  TmdbSearchItem,
  TmdbDetail,
} from "./types";

const BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w500";

/** How many /search/multi hits we resolve to IMDb ids. Each resolution is one
 *  extra request; TMDB's rate limit is generous but the grid only shows a
 *  handful, so there is no point resolving the long tail. */
const SEARCH_RESOLVE_LIMIT = 12;

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
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function imdbIdFor(mediaType: "movie" | "tv", tmdbId: number): Promise<string | null> {
  const ext = await tmdbFetch<TmdbExternalIds>(`/${mediaType}/${tmdbId}/external_ids`);
  return ext.imdb_id ?? null;
}

/**
 * Multi-search, then map each movie/TV hit to its IMDb id so results merge with
 * the IMDb-keyed set the rest of the app is built around. Hits without an IMDb
 * id are dropped — a card with no IMDb id can neither open its detail page nor
 * be downloaded.
 */
export async function searchTmdb(query: string): Promise<TmdbSearchItem[]> {
  const data = await tmdbFetch<TmdbMultiResponse>("/search/multi", {
    query,
    include_adult: "false",
  });

  const candidates = (data.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, SEARCH_RESOLVE_LIMIT);

  const resolved = await Promise.all(
    candidates.map(async (r) => {
      const mediaType = r.media_type as "movie" | "tv";
      const imdbId = await imdbIdFor(mediaType, r.id).catch(() => null);
      if (!imdbId) return null;
      return {
        imdbId,
        title: (r.title ?? r.name ?? "").trim(),
        year: yearOf(r),
        type: mediaType === "tv" ? "series" : "movie",
        poster: posterUrl(r.poster_path),
      } satisfies TmdbSearchItem;
    })
  );

  return resolved.filter((x): x is TmdbSearchItem => x !== null && x.title.length > 0);
}

/**
 * Resolve a title straight from its IMDb id via /find — one request, no search
 * ambiguity. Used to backfill poster, plot and rating on the detail page when
 * OMDb is capped or the IMDb proxy is down.
 */
export async function getTmdbDetailByImdb(imdbId: string): Promise<TmdbDetail | null> {
  const data = await tmdbFetch<TmdbFindResponse>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });

  const movie = data.movie_results?.[0];
  const tv = data.tv_results?.[0];
  const hit: TmdbFindItem | undefined = movie ?? tv;
  if (!hit) return null;

  return {
    imdbId,
    title: (hit.title ?? hit.name ?? "").trim(),
    year: yearOf(hit),
    type: !movie && tv ? "series" : "movie",
    poster: posterUrl(hit.poster_path),
    plot: hit.overview || undefined,
    rating: ratingOf(hit.vote_average),
  };
}
