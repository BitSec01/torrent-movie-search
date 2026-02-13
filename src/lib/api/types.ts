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

// ── Torrent types ──

export interface TorrentLink {
  title: string;
  provider: string;
  seeds: number;
  peers: number;
  size: string;
  magnet?: string;
  link?: string;
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
