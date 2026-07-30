import type {
  OmdbSearchItem,
  UnifiedSearchResult,
  OmdbDetailResponse,
  UnifiedDetail,
  TmdbSearchItem,
  TmdbDetail,
} from "./types";

/** OMDb writes "N/A" where it has no value, so its strings need unwrapping
 *  before they can be treated as present. */
function present(value: string | undefined | null): string | undefined {
  if (!value || value === "N/A") return undefined;
  return value;
}

function normalizeType(raw: string | undefined): string {
  if (!raw) return "movie";
  const lower = raw.toLowerCase();
  if (lower.includes("series") || lower === "tvseries" || lower === "tvminiseries") return "series";
  if (lower === "episode" || lower === "tvepisode") return "episode";
  return "movie";
}

/**
 * TMDB is the base layer and OMDb is additive: OMDb fills gaps and contributes
 * titles TMDB missed, but never overwrites a value TMDB already supplied. The
 * app therefore looks the same whether or not OMDb is configured or answering.
 */
export function mergeSearchResults(
  tmdbResults: TmdbSearchItem[],
  omdbResults: OmdbSearchItem[] = []
): UnifiedSearchResult[] {
  const map = new Map<string, UnifiedSearchResult>();

  for (const item of tmdbResults) {
    map.set(item.imdbId, {
      imdbId: item.imdbId,
      title: item.title,
      year: item.year,
      type: item.type,
      poster: item.poster,
      plot: item.plot,
    });
  }

  for (const item of omdbResults) {
    const existing = map.get(item.imdbID);
    if (existing) {
      if (!existing.poster) existing.poster = present(item.Poster) ?? null;
      if (!existing.year) existing.year = item.Year;
    } else {
      map.set(item.imdbID, {
        imdbId: item.imdbID,
        title: item.Title,
        year: item.Year,
        type: normalizeType(item.Type),
        poster: present(item.Poster) ?? null,
      });
    }
  }

  return Array.from(map.values()).filter((item) => item.title);
}

/**
 * Same rule as search: TMDB supplies the whole record, OMDb fills what TMDB
 * lacks. The exceptions are the fields TMDB has no equivalent for — the Rotten
 * Tomatoes and Metacritic scores, awards, and the IMDb rating itself — which
 * are the reason to keep OMDb wired in at all.
 */
export function mergeDetail(
  tmdb: TmdbDetail | null,
  omdb: OmdbDetailResponse | null = null
): UnifiedDetail | null {
  if (!tmdb && !omdb) return null;

  const ratings = omdb?.Ratings?.map((r) => ({ source: r.Source, value: r.Value })) ?? [];
  if (tmdb?.rating && !ratings.some((r) => r.source === "TMDB")) {
    ratings.push({ source: "TMDB", value: `${tmdb.rating}/10` });
  }

  const genres = tmdb?.genres.length
    ? tmdb.genres
    : present(omdb?.Genre)?.split(",").map((g) => g.trim()) ?? [];

  return {
    imdbId: tmdb?.imdbId ?? omdb?.imdbID ?? "",
    title: tmdb?.title || present(omdb?.Title) || "",
    year: tmdb?.year || present(omdb?.Year) || "",
    rated: tmdb?.rated ?? present(omdb?.Rated),
    released: tmdb?.released ?? present(omdb?.Released),
    runtime: tmdb?.runtime ?? present(omdb?.Runtime),
    genres,
    director: tmdb?.director ?? present(omdb?.Director),
    writer: tmdb?.writer ?? present(omdb?.Writer),
    actors: tmdb?.actors ?? present(omdb?.Actors),
    plot: tmdb?.plot ?? present(omdb?.Plot),
    language: tmdb?.language ?? present(omdb?.Language),
    country: tmdb?.country ?? present(omdb?.Country),
    awards: present(omdb?.Awards),
    poster: tmdb?.poster ?? present(omdb?.Poster) ?? null,
    ratings,
    // TMDB's own score is already in `ratings`; imdbRating is specifically
    // IMDb's, which only OMDb carries.
    imdbRating: present(omdb?.imdbRating),
    imdbVotes: present(omdb?.imdbVotes),
    type: normalizeType(tmdb?.type ?? omdb?.Type),
    boxOffice: tmdb?.boxOffice ?? present(omdb?.BoxOffice),
    totalSeasons: tmdb?.totalSeasons ?? omdb?.totalSeasons,
    contentRating: tmdb?.rated ?? present(omdb?.Rated),
  };
}
