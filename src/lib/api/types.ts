// ── OMDB API types ──

export interface OmdbSearchItem {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string; // "movie" | "series" | "episode"
  Poster: string;
}

export interface OmdbSearchResponse {
  Search?: OmdbSearchItem[];
  totalResults?: string;
  Response: string;
  Error?: string;
}

export interface OmdbDetailResponse {
  Title: string;
  Year: string;
  Rated: string;
  Released: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Writer: string;
  Actors: string;
  Plot: string;
  Language: string;
  Country: string;
  Awards: string;
  Poster: string;
  Ratings: { Source: string; Value: string }[];
  Metascore: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Type: string;
  DVD: string;
  BoxOffice: string;
  Production: string;
  Website: string;
  totalSeasons?: string;
  Response: string;
  Error?: string;
}

// ── TMDB API types ──

/** A raw search hit. Movies carry title/release_date, TV carries
 *  name/first_air_date, and people (filtered out) carry neither.
 *  `media_type` is only present on /search/multi. */
export interface TmdbSearchHit {
  id: number;
  media_type?: "movie" | "tv" | "person" | string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
}

export interface TmdbSearchHitResponse {
  results?: TmdbSearchHit[];
  total_results?: number;
}

export interface TmdbExternalIds {
  imdb_id?: string | null;
}

export interface TmdbFindResponse {
  movie_results?: TmdbSearchHit[];
  tv_results?: TmdbSearchHit[];
}

/**
 * The movie and TV detail endpoints return the same document with a handful of
 * fields renamed (title/name, runtime/episode_run_time) and the certification
 * living under a different append. Modelling both as one optional-heavy shape
 * keeps a single mapper rather than two that drift.
 */
export interface TmdbTitleDetail {
  id: number;
  imdb_id?: string | null;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  genres?: { id: number; name: string }[];
  vote_average?: number;
  vote_count?: number;
  revenue?: number;
  spoken_languages?: { english_name?: string; name?: string }[];
  production_countries?: { name: string }[];
  created_by?: { name: string }[];
  credits?: TmdbCredits;
  aggregate_credits?: TmdbCredits;
  release_dates?: {
    results?: { iso_3166_1: string; release_dates?: { certification?: string }[] }[];
  };
  content_ratings?: { results?: { iso_3166_1: string; rating?: string }[] };
  external_ids?: TmdbExternalIds;
}

export interface TmdbCredits {
  cast?: { name: string }[];
  crew?: { name: string; job?: string }[];
}

/** Normalized TMDB search hit, already keyed on the IMDb id the rest of the app
 *  uses and carrying a fully-qualified poster URL. */
export interface TmdbSearchItem {
  imdbId: string;
  title: string;
  year: string;
  type: "movie" | "series";
  poster: string | null;
  plot?: string;
}

export interface TmdbSearchResponse {
  items: TmdbSearchItem[];
  totalResults: number;
}

/** Normalized TMDB detail. Field-for-field what the unified detail needs, so a
 *  title renders completely from TMDB alone. */
export interface TmdbDetail {
  imdbId: string;
  title: string;
  year: string;
  type: "movie" | "series";
  poster: string | null;
  plot?: string;
  rating?: string;
  votes?: string;
  runtime?: string;
  genres: string[];
  director?: string;
  writer?: string;
  actors?: string;
  language?: string;
  country?: string;
  released?: string;
  rated?: string;
  boxOffice?: string;
  totalSeasons?: string;
}

// ── Torrent types ──

export interface TorrentLink {
  title: string;
  provider: string;
  seeds: number;
  peers: number;
  size: string;
  magnet?: string;
  link?: string;
  /** Info hash — what the AI tools reference instead of the full magnet URI */
  id?: string;
}

// ── Unified / merged types ──

export interface UnifiedSearchResult {
  imdbId: string;
  title: string;
  year: string;
  type: "movie" | "series" | "episode" | string;
  poster: string | null;
  plot?: string;
  torrentLinks?: TorrentLink[];
}

export interface UnifiedDetail {
  imdbId: string;
  title: string;
  year: string;
  rated?: string;
  released?: string;
  runtime?: string;
  genres: string[];
  director?: string;
  writer?: string;
  actors?: string;
  plot?: string;
  language?: string;
  country?: string;
  awards?: string;
  poster: string | null;
  ratings: { source: string; value: string }[];
  imdbRating?: string;
  imdbVotes?: string;
  type: string;
  boxOffice?: string;
  totalSeasons?: string;
  contentRating?: string;
}
