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
import { searchTitles } from "@/lib/api/metadata";
import { attachTorrentLinks } from "@/lib/api/torrent-match";
import { searchTorrents } from "@/lib/api/torrent";
import { searchTPB } from "@/lib/api/tpb-scraper";
import { rememberMagnet, resolveMagnet } from "@/lib/api/magnet-registry";
import { torrentsDir } from "@/lib/config";
import { addDownload } from "@/lib/library/add-download";
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

export async function executeMovieSearch({
  query,
}: z.infer<typeof searchInputSchema>): Promise<MovieSearchOutput> {
  const [metadata, torrentResults, tpbResults] = await Promise.all([
    searchTitles(query).catch(() => ({ results: [] })),
    searchTorrents(query, "Movies", 5).catch(() => []),
    searchTPB(query, 5).catch(() => []),
  ]);

  const merged = attachTorrentLinks(
    metadata.results,
    withIds([...torrentResults, ...tpbResults])
  );

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
}: z.infer<typeof downloadInputSchema>): Promise<{
  success: boolean;
  message: string;
  savePath?: string;
}> {
  const magnet = resolveMagnet(torrentId, title);
  if (!magnet) {
    return { success: false, message: `Unknown torrent id: ${torrentId}. Search again to get a current id.` };
  }

  try {
    const result = await addDownload({
      magnet,
      title,
      year,
      type: contentType,
      imdbId,
      poster,
      totalSeasons,
    });

    if (!result.success) return result;

    // Everything lands in the torrents directory and is filed into Movies or
    // Series by the organiser, so that is the path to report — not a guess from
    // contentType, which would describe a destination nothing writes to yet.
    return { success: true, message: result.message || `Started downloading: ${title}`, savePath: torrentsDir() };
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
