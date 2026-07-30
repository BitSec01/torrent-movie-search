/**
 * The single place that decides which metadata sources exist and how they
 * combine. Callers ask for a title and get a unified record back; swapping a
 * source in or out happens here rather than in every route.
 */

import { searchTmdb, getTmdbDetailByImdb, tmdbConfigured } from "./tmdb";
import { searchOmdb, getOmdbDetail, omdbConfigured } from "./omdb";
import { mergeSearchResults, mergeDetail } from "./merge";
import { MetadataSourceError } from "./errors";
import type { UnifiedSearchResult, UnifiedDetail } from "./types";

export interface TitleSearchOptions {
  type?: string;
  year?: string;
  page?: number;
}

export interface TitleSearchResponse {
  results: UnifiedSearchResult[];
  totalResults?: number;
}

const EMPTY_TMDB = { items: [], totalResults: 0 };

/**
 * OMDb's search is title-prefix based and returns nothing useful for one or two
 * characters, so short queries only cost quota.
 */
const OMDB_MIN_QUERY = 3;

export async function searchTitles(
  query: string,
  options: TitleSearchOptions = {}
): Promise<TitleSearchResponse> {
  const [tmdb, omdb] = await Promise.all([
    tmdbConfigured()
      ? searchTmdb(query, options).catch((err) => {
          console.error("[TMDB] search error:", err);
          return EMPTY_TMDB;
        })
      : Promise.resolve(EMPTY_TMDB),
    omdbConfigured() && query.length >= OMDB_MIN_QUERY
      ? searchOmdb(query, options).catch((err) => {
          console.error("[OMDb] search error:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const omdbItems = omdb?.Response === "True" ? omdb.Search ?? [] : [];
  const results = mergeSearchResults(tmdb.items, omdbItems);

  return {
    results,
    totalResults: tmdb.totalResults || Number(omdb?.totalResults) || results.length,
  };
}

export async function getTitleDetail(imdbId: string): Promise<UnifiedDetail | null> {
  const [tmdb, omdb] = await Promise.all([
    tmdbConfigured()
      ? getTmdbDetailByImdb(imdbId).catch((err) => {
          console.error("[TMDB] detail error:", err);
          return null;
        })
      : Promise.resolve(null),
    omdbConfigured()
      ? getOmdbDetail(imdbId, "full").catch((err) => {
          console.error("[OMDb] detail error:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return mergeDetail(tmdb, omdb?.Response === "True" ? omdb : null);
}

export interface TitleMetadata {
  imdbId: string;
  poster: string | null;
  year: string;
}

/**
 * Best single match for a loose title, used to backfill rows that were created
 * from a torrent name and have no IMDb id yet. Source failures propagate: the
 * caller loops over many rows and a dead key fails identically for all of them.
 */
export async function lookupTitleMetadata(
  title: string,
  options: { year?: string | null; type: "movie" | "series" }
): Promise<TitleMetadata | null> {
  const query = options.year ? `${title} ${options.year}` : title;

  if (tmdbConfigured()) {
    const { items } = await searchTmdb(query, { type: options.type });
    const match = items[0];
    if (match) return { imdbId: match.imdbId, poster: match.poster, year: match.year };
  }

  if (omdbConfigured()) {
    const res = await searchOmdb(query, { type: options.type });
    const match = res.Response === "True" ? res.Search?.[0] : undefined;
    if (match) {
      return {
        imdbId: match.imdbID,
        poster: match.Poster && match.Poster !== "N/A" ? match.Poster : null,
        year: match.Year,
      };
    }
  }

  return null;
}

export { MetadataSourceError };
