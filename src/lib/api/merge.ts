import type {
  ImdbSearchResult,
  OmdbSearchItem,
  UnifiedSearchResult,
  ImdbDetailResponse,
  OmdbDetailResponse,
  UnifiedDetail,
  TmdbSearchItem,
  TmdbDetail,
} from "./types";

function normalizePoster(poster: string | undefined | null): string | null {
  if (!poster || poster === "N/A") return null;
  return poster;
}

function normalizeType(raw: string | undefined): string {
  if (!raw) return "movie";
  const lower = raw.toLowerCase();
  if (lower.includes("series") || lower === "tvseries" || lower === "tvminiseries") return "series";
  if (lower === "episode" || lower === "tvepisode") return "episode";
  return "movie";
}

export function mergeSearchResults(
  imdbResults: ImdbSearchResult[],
  omdbResults: OmdbSearchItem[],
  tmdbResults: TmdbSearchItem[] = []
): UnifiedSearchResult[] {
  const map = new Map<string, UnifiedSearchResult>();

  // Add IMDb results first
  for (const item of imdbResults) {
    const id = item["#IMDB_ID"];
    map.set(id, {
      imdbId: id,
      title: item["#TITLE"],
      year: item["#YEAR"]?.toString() ?? "",
      type: "movie",
      poster: item["#IMG_POSTER"] ?? null,
      cast: item["#ACTORS"],
    });
  }

  // Merge OMDB results — fill gaps or add new entries
  for (const item of omdbResults) {
    const existing = map.get(item.imdbID);
    if (existing) {
      if (!existing.poster) existing.poster = normalizePoster(item.Poster);
      if (!existing.year && item.Year) existing.year = item.Year;
    } else {
      map.set(item.imdbID, {
        imdbId: item.imdbID,
        title: item.Title,
        year: item.Year,
        type: normalizeType(item.Type),
        poster: normalizePoster(item.Poster),
      });
    }
  }

  // Merge TMDB results — the reliable poster source, and often the only source
  // still answering when OMDb is rate-limited and the IMDb proxy is down.
  for (const item of tmdbResults) {
    const existing = map.get(item.imdbId);
    if (existing) {
      if (!existing.poster) existing.poster = item.poster;
      if (!existing.year && item.year) existing.year = item.year;
    } else {
      map.set(item.imdbId, {
        imdbId: item.imdbId,
        title: item.title,
        year: item.year,
        type: item.type,
        poster: item.poster,
      });
    }
  }

  return Array.from(map.values()).filter((item) => item.title);
}

export function mergeDetail(
  imdb: ImdbDetailResponse | null,
  omdb: OmdbDetailResponse | null,
  tmdb: TmdbDetail | null = null
): UnifiedDetail | null {
  if (!imdb && !omdb && !tmdb) return null;

  const short = imdb?.short;
  const top = imdb?.top;

  const title = omdb?.Title ?? short?.name ?? top?.title ?? tmdb?.title ?? "";
  const imdbId = omdb?.imdbID ?? top?.id ?? tmdb?.imdbId ?? "";

  // OMDb ratings first, then TMDB as a distinct source rather than overwriting.
  const ratings = omdb?.Ratings?.map((r) => ({ source: r.Source, value: r.Value })) ?? [];
  if (tmdb?.rating && !ratings.some((r) => r.source === "TMDB")) {
    ratings.push({ source: "TMDB", value: `${tmdb.rating}/10` });
  }

  return {
    imdbId,
    title,
    year:
      omdb?.Year ?? top?.year?.toString() ?? short?.datePublished?.slice(0, 4) ?? tmdb?.year ?? "",
    rated: omdb?.Rated !== "N/A" ? omdb?.Rated : undefined,
    released: omdb?.Released !== "N/A" ? omdb?.Released : short?.datePublished,
    runtime: omdb?.Runtime !== "N/A" ? omdb?.Runtime : "",
    genres:
      omdb?.Genre && omdb.Genre !== "N/A"
        ? omdb.Genre.split(",").map((g) => g.trim())
        : short?.genre ?? top?.genres ?? [],
    director: omdb?.Director !== "N/A" ? omdb?.Director : short?.director?.map((d) => d.name).join(", "),
    writer: omdb?.Writer !== "N/A" ? omdb?.Writer : undefined,
    actors:
      omdb?.Actors !== "N/A"
        ? omdb?.Actors
        : short?.actor?.map((a) => a.name).join(", "),
    plot:
      (omdb?.Plot && omdb.Plot !== "N/A" ? omdb.Plot : undefined) ??
      short?.description ??
      top?.plot ??
      tmdb?.plot,
    language: omdb?.Language !== "N/A" ? omdb?.Language : undefined,
    country: omdb?.Country !== "N/A" ? omdb?.Country : undefined,
    awards: omdb?.Awards !== "N/A" ? omdb?.Awards : undefined,
    poster:
      normalizePoster(omdb?.Poster) ??
      normalizePoster(short?.image) ??
      normalizePoster(top?.poster) ??
      tmdb?.poster ??
      null,
    ratings,
    imdbRating: omdb?.imdbRating !== "N/A" ? omdb?.imdbRating : short?.aggregateRating?.ratingValue?.toString(),
    imdbVotes: omdb?.imdbVotes !== "N/A" ? omdb?.imdbVotes : short?.aggregateRating?.ratingCount?.toString(),
    type: normalizeType(omdb?.Type ?? short?.type ?? top?.type ?? tmdb?.type),
    boxOffice: omdb?.BoxOffice !== "N/A" ? omdb?.BoxOffice : undefined,
    totalSeasons: omdb?.totalSeasons,
    contentRating: short?.contentRating,
  };
}
