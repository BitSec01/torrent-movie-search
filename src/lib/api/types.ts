// ── IMDb Unofficial API types ──

export interface ImdbSearchResult {
  "#TITLE": string;
  "#YEAR": number;
  "#IMDB_ID": string;
  "#RANK": number;
  "#ACTORS"?: string;
  "#AKA"?: string;
  "#IMDB_URL"?: string;
  "#IMDB_IV"?: string;
  "#IMG_POSTER"?: string;
  photo_width?: number;
  photo_height?: number;
}

export interface ImdbSearchResponse {
  ok: boolean;
  description: ImdbSearchResult[];
  error_code?: number;
}

export interface ImdbDetailResponse {
  ok: boolean;
  short?: {
    name?: string;
    description?: string;
    image?: string;
    genre?: string[];
    datePublished?: string;
    actor?: { name: string; url?: string }[];
    director?: { name: string; url?: string }[];
    duration?: string;
    contentRating?: string;
    aggregateRating?: { ratingValue?: number; ratingCount?: number };
    type?: string;
  };
  top?: {
    id?: string;
    title?: string;
    type?: string;
    year?: number;
    runtime?: string;
    genres?: string[];
    plot?: string;
    poster?: string;
  };
  main?: {
    episodes?: {
      seasons?: { number: number; episodes: { id: string; title: string; number: number; season: number; year?: number }[] }[];
      totalEpisodes?: number;
    };
    cast?: { node: { name: { id: string; nameText: { text: string } }; characters?: { name: string }[] } }[];
  };
  [key: string]: unknown;
}

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

/** A raw /search/multi hit. Movies carry title/release_date, TV carries
 *  name/first_air_date, and people (filtered out) carry neither. */
export interface TmdbMultiResult {
  id: number;
  media_type: "movie" | "tv" | "person" | string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
}

export interface TmdbMultiResponse {
  results?: TmdbMultiResult[];
  total_results?: number;
}

export interface TmdbExternalIds {
  imdb_id?: string | null;
}

export interface TmdbFindItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
}

export interface TmdbFindResponse {
  movie_results?: TmdbFindItem[];
  tv_results?: TmdbFindItem[];
}

/** Normalized TMDB search hit, already keyed on the IMDb id the rest of the app
 *  uses and carrying a fully-qualified poster URL. */
export interface TmdbSearchItem {
  imdbId: string;
  title: string;
  year: string;
  type: "movie" | "series";
  poster: string | null;
}

export interface TmdbDetail {
  imdbId: string;
  title: string;
  year: string;
  type: "movie" | "series";
  poster: string | null;
  plot?: string;
  rating?: string;
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
  cast?: string;
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
