/**
 * Tool definitions for the movie librarian chat.
 *
 * Every tool result is sent to the model on each subsequent step of the agent
 * loop, so a result that is cheap once is expensive ten steps later. These tools
 * therefore return the full payload to the UI (which renders cards and needs
 * real magnet URIs) while `toModelOutput` hands the model a slimmed version that
 * references torrents by info hash. See magnet-registry for the round trip.
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { searchImdb } from "@/lib/api/imdb";
import { searchOmdb } from "@/lib/api/omdb";
import { searchTmdb, tmdbConfigured } from "@/lib/api/tmdb";
import { mergeSearchResults } from "@/lib/api/merge";
import { searchTorrents } from "@/lib/api/torrent";
import { searchTPB } from "@/lib/api/tpb-scraper";
import { rememberMagnet, resolveMagnet } from "@/lib/api/magnet-registry";
import { savePathFor } from "@/lib/config";
import type { TorrentLink, UnifiedSearchResult } from "@/lib/api/types";

/** How many torrents the model sees per search. It picks by seeds and quality,
 *  and never needs the long tail the UI is free to keep. */
export const MODEL_TORRENT_LIMIT = 8;

/** Torrents attached per movie card when the model reviews search results */
export const MODEL_TORRENTS_PER_MOVIE = 3;

export interface TorrentSearchOutput {
  query: string;
  torrents: TorrentLink[];
}

export interface MovieSearchOutput {
  query: string;
  results: UnifiedSearchResult[];
  totalFound: number;
}

/** Tag each torrent with its info hash and stash the full magnet for later resolution */
function withIds(torrents: TorrentLink[]): TorrentLink[] {
  return torrents.map((t) => ({
    ...t,
    id: t.magnet ? rememberMagnet(t.magnet) ?? undefined : undefined,
  }));
}

/** Drop magnets and the long tail — the model reasons over titles, seeds and size */
export function slimTorrentSearch(output: TorrentSearchOutput) {
  return {
    query: output.query,
    torrents: output.torrents
      .filter((t) => t.id)
      .slice(0, MODEL_TORRENT_LIMIT)
      .map((t) => ({
        id: t.id,
        title: t.title,
        seeds: t.seeds,
        size: t.size,
        provider: t.provider,
      })),
  };
}

/** Posters, cast and plot are rendered as cards; the model only needs identity */
export function slimMovieSearch(output: MovieSearchOutput) {
  return {
    query: output.query,
    totalFound: output.totalFound,
    results: output.results.map((r) => ({
      imdbId: r.imdbId,
      title: r.title,
      year: r.year,
      type: r.type,
      torrents: (r.torrentLinks ?? [])
        .filter((t) => t.id)
        .slice(0, MODEL_TORRENTS_PER_MOVIE)
        .map((t) => ({ id: t.id, title: t.title, seeds: t.seeds, size: t.size })),
    })),
  };
}

const searchInputSchema = z.object({
  query: z.string().describe("The movie or series title to search for"),
});

const searchTorrentsInputSchema = z.object({
  query: z.string().describe("The movie or series title to search torrent sites for"),
});

const downloadInputSchema = z.object({
  torrentId: z
    .string()
    .describe("The id of the torrent to download, taken from a searchTorrents or searchMovies result"),
  title: z.string().describe("The name of the movie/torrent being downloaded, for display purposes"),
  contentType: z
    .enum(["movie", "series"])
    .describe("Whether this is a movie or a series/episode, which decides the save folder"),
  year: z.string().optional().describe("The year of the movie/series, if known"),
  imdbId: z.string().optional().describe("The IMDb ID of the movie/series, if known"),
  poster: z.string().optional().describe("The poster URL, if known"),
  totalSeasons: z.string().optional().describe("Total seasons for series, if known"),
});

/** Strip punctuation & collapse whitespace for fuzzy title matching */
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export async function executeMovieSearch({
  query,
}: z.infer<typeof searchInputSchema>): Promise<MovieSearchOutput> {
  const shouldQueryOmdb = query.length >= 3;

  const [imdbRes, omdbRes, tmdbResults, torrentResults, tpbResults] = await Promise.all([
    searchImdb(query).catch(() => null),
    shouldQueryOmdb ? searchOmdb(query).catch(() => null) : Promise.resolve(null),
    tmdbConfigured() ? searchTmdb(query).catch(() => []) : Promise.resolve([]),
    searchTorrents(query, "Movies", 5).catch(() => []),
    searchTPB(query, 5).catch(() => []),
  ]);

  const allTorrents = withIds([...torrentResults, ...tpbResults]);

  const imdbResults = imdbRes?.ok ? imdbRes.description ?? [] : [];
  const omdbResults = omdbRes?.Response === "True" ? omdbRes.Search ?? [] : [];

  const merged = mergeSearchResults(imdbResults, omdbResults, tmdbResults);

  for (const movie of merged) {
    const movieTitle = norm(movie.title);
    const matching = allTorrents.filter((t) => {
      const tTitle = norm(t.title);
      const tBase = norm(t.title.split(/\s*[\(\[\{]/)[0] ?? "");
      return tTitle.includes(movieTitle) || movieTitle.includes(tBase);
    });
    if (matching.length > 0) {
      matching.sort((a, b) => b.seeds - a.seeds);
      movie.torrentLinks = matching;
    }
  }

  return { query, results: merged.slice(0, 5), totalFound: merged.length };
}

export async function executeTorrentSearch({
  query,
}: z.infer<typeof searchTorrentsInputSchema>): Promise<TorrentSearchOutput> {
  const [torrentResults, tpbResults] = await Promise.all([
    searchTorrents(query, "Movies", 10).catch(() => []),
    searchTPB(query, 10).catch(() => []),
  ]);

  const all = [...torrentResults, ...tpbResults].sort((a, b) => b.seeds - a.seeds).slice(0, 15);
  return { query, torrents: withIds(all) };
}

export async function executeDownload({
  torrentId,
  title,
  contentType,
  year,
  imdbId,
  poster,
  totalSeasons,
}: z.infer<typeof downloadInputSchema>) {
  const magnet = resolveMagnet(torrentId, title);
  if (!magnet) {
    return { success: false, message: `Unknown torrent id: ${torrentId}. Search again to get a current id.` };
  }

  const savePath = savePathFor(contentType);

  try {
    // Go through the download endpoint rather than qBittorrent directly so the
    // item is recorded in the library.
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/torrents/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magnet, title, year, type: contentType, imdbId, poster, totalSeasons }),
    });

    if (res.ok) {
      const result = await res.json();
      return { success: true, message: result.message || `Started downloading: ${title}`, savePath };
    }

    const error = await res.json();
    return { success: false, message: error.error || "Failed to download" };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

export const chatTools = {
  searchMovies: tool({
    description:
      "Search for a movie or TV series by title. Returns matching results with poster, year and type, displayed as visual cards in the UI. Search one title at a time for best results.",
    inputSchema: zodSchema(searchInputSchema),
    execute: executeMovieSearch,
    toModelOutput: ({ output }) => ({ type: "json" as const, value: slimMovieSearch(output) }),
  }),

  searchTorrents: tool({
    description:
      "Search torrent sites (ThePirateBay, etc.) for available downloads. Returns torrents with an id, title, seeds and size. Use this BEFORE downloadTorrent so you can review the list and pick the one that matches what the user actually wants.",
    inputSchema: zodSchema(searchTorrentsInputSchema),
    execute: executeTorrentSearch,
    toModelOutput: ({ output }) => ({ type: "json" as const, value: slimTorrentSearch(output) }),
  }),

  downloadTorrent: tool({
    description:
      "Send a torrent to qBittorrent to start downloading. Pass the id from a searchTorrents or searchMovies result — never a magnet link. Set contentType to 'movie' or 'series' for the correct save path.",
    inputSchema: zodSchema(downloadInputSchema),
    execute: executeDownload,
  }),
};
