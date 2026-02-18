import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, zodSchema, convertToModelMessages } from "ai";
import { z } from "zod";
import { searchImdb } from "@/lib/api/imdb";
import { searchOmdb } from "@/lib/api/omdb";
import { mergeSearchResults } from "@/lib/api/merge";
import { searchTorrents } from "@/lib/api/torrent";
import { searchTPB } from "@/lib/api/tpb-scraper";
import { addTorrent } from "@/lib/api/qbittorrent";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a friendly movie and TV series librarian chatbot with powerful abilities. You can search for movies, find torrent links, and start downloads for the user.

YOUR TOOLS:
1. **searchMovies** — Search for a movie or series by title. Results appear as visual cards in the app with posters, ratings, and available torrent links.
2. **searchTorrents** — Search torrent sites (ThePirateBay etc.) for a specific title. Returns a detailed list of available torrents with titles, seeds, size, and magnet URLs. Use this BEFORE downloading so you can pick the correct torrent.
3. **downloadTorrent** — Send a magnet link to qBittorrent to start downloading. You MUST specify whether it's a "movie" or "series" so it goes to the right folder.

HOW TO THINK & ACT:
- You have extensive knowledge of movies and TV series. When a user asks for recommendations (e.g. "movies like Inception", "best 90s action movies", "sci-fi from 1980 to 1999"), THINK of specific titles from your knowledge, then search EACH title individually using searchMovies so they appear in the UI.
- For example, if asked "find me movies from the 80s about robots", think of titles like "The Terminator", "RoboCop", "Short Circuit", "Blade Runner" and search each one.
- Always search each title individually — do NOT combine multiple titles into one search query.
- You can search up to 20 titles per turn if needed.

SEARCH TIPS:
- If searchMovies returns no results or poor results for a title, try adding the release year to the query (e.g. "Inception 2010", "The Matrix 1999"). This helps disambiguate when multiple movies share a name or when the user mentions an older film.
- For TV series, searchMovies may not always find results since the databases focus on movies. If you can't find a series through searchMovies, fall back to **searchTorrents** directly — it searches ThePirateBay which often has series content.
- When searching for series on torrent sites, be smart with your queries. Try variations like:
  - "Suits" (general)
  - "Suits Season 1" or "Suits S01" (specific season)
  - "Suits S01E03" (specific episode)
  - "Suits Complete" or "Suits Full Series" (everything)
  - "Suits S01E01", "Suits S01E02", etc. (individual episodes)
- If the user asks for specific episodes (e.g. "episodes 1-5"), search for each episode individually using the S01E01 format and download them one by one.
- If a specific episode search fails, try the full season pack instead and let the user know.

TORRENT DISCOVERY (DISCUSS BEFORE DOWNLOADING):
- When the user asks about torrents or what's available, use **searchTorrents** with multiple query variations to cast a wide net. Then SUMMARIZE your findings conversationally — tell the user what you found, which ones look best, and ask which they'd like to download.
- You can do multiple passes with different search terms to find the best results. For example, search "Suits S01", then "Suits Season 1 Complete", then "Suits S01E01" etc. and report back.
- The user may want to discuss and pick together. Don't just download automatically — present your findings first unless the user explicitly says "download it" or "just grab it".

DOWNLOADING (IMPORTANT — 2-STEP PROCESS):
1. First, use **searchTorrents** to get the list of available torrents for the title. This returns torrent names, seeds, size, and magnet URLs.
2. Then, CAREFULLY review the torrent list. Torrent names often contain unrelated content (e.g. searching "Ad Astra" may return "Star Trek Ad Astra" episodes mixed in with the actual movie). You must pick the torrent that ACTUALLY matches what the user wants:
   - Match the correct title (not a different show/movie with similar words)
   - Prefer 1080p or BluRay quality
   - Prefer higher seed counts for reliability
   - Prefer reasonable file sizes (1-4 GB for movies is typical for 1080p)
3. Use **downloadTorrent** with the chosen magnet link. Set contentType to "movie" for movies or "series" for TV series/episodes.
   - Movies are saved to /mnt/storage/Movies
   - Series/episodes are saved to /mnt/storage/torrents
4. If the user says "download all of those" or "download the ones you suggested", search torrents and download the best one for each title.

LARGE DOWNLOADS (SERIES WITH MANY SEASONS/EPISODES):
- NEVER bulk-download an entire series (e.g. all 9 seasons of Suits) without asking first. That could be dozens of torrents and hundreds of gigabytes.
- Instead, search for what's available (season packs, complete series, individual seasons), summarize the options (e.g. "I found complete season packs for S01-S09, about 4-6 GB each, plus a full series pack at 45 GB"), and ask the user what they want.
- Let the user decide: maybe they want just season 1 to start, or a complete pack, or specific episodes. Wait for confirmation before downloading.
- Only download what the user explicitly confirms. If they say "grab season 1 and 2", download those two — not the rest.

SEARCH RESULTS:
- Search results are automatically displayed as visual cards in the app — you do NOT need to repeat details like year, cast, plot, or rating in your text response.

RESPONSE STYLE:
- Keep text responses SHORT and conversational. No markdown formatting — no headers, no bold, no bullet lists, no numbered lists.
- After searching, just write a brief natural sentence or two about why you picked those movies.
- Never repeat information that's already visible in the movie cards.
- Be warm and enthusiastic but concise. This is a chat, not an essay.
- When downloading, briefly confirm what torrent you picked and why (e.g. "Grabbing the 1080p BluRay version with 150 seeds").

If the user is vague, ask a quick clarifying question or just suggest a diverse mix.`;

const searchInputSchema = z.object({
  query: z.string().describe("The movie or series title to search for"),
});

const searchTorrentsInputSchema = z.object({
  query: z.string().describe("The movie or series title to search torrent sites for"),
});

const downloadInputSchema = z.object({
  magnet: z.string().describe("The magnet link to send to qBittorrent for downloading"),
  title: z.string().describe("The name of the movie/torrent being downloaded, for display purposes"),
  contentType: z.enum(["movie", "series"]).describe("Whether this is a movie or a series/episode. Movies go to /mnt/storage/Movies, series go to /mnt/storage/torrents"),
  year: z.string().optional().describe("The year of the movie/series, if known"),
  imdbId: z.string().optional().describe("The IMDb ID of the movie/series, if known"),
  poster: z.string().optional().describe("The poster URL, if known"),
  totalSeasons: z.string().optional().describe("Total seasons for series, if known"),
});

/** Strip punctuation & collapse whitespace for fuzzy title matching */
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function executeSearch({ query }: z.infer<typeof searchInputSchema>) {
  console.log("[AI Tool] searchMovies called with query:", query);
  const shouldQueryOmdb = query.length >= 3;

  const [imdbRes, omdbRes, torrentResults, tpbResults] = await Promise.all([
    searchImdb(query).catch(() => null),
    shouldQueryOmdb ? searchOmdb(query).catch(() => null) : Promise.resolve(null),
    searchTorrents(query, "Movies", 5).catch(() => []),
    searchTPB(query, 5).catch(() => []),
  ]);

  const allTorrents = [...torrentResults, ...tpbResults];

  const imdbResults = imdbRes?.ok ? imdbRes.description ?? [] : [];
  const omdbResults =
    omdbRes?.Response === "True" ? omdbRes.Search ?? [] : [];

  const merged = mergeSearchResults(imdbResults, omdbResults);

  // Attach torrent links to matching movies
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

  console.log("[AI Tool] searchMovies result for", query, ":", merged.length, "results,", torrentResults.length, "torrents,", tpbResults.length, "tpb");

  return {
    query,
    results: merged.slice(0, 5),
    totalFound: merged.length,
  };
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const modelMessages = await convertToModelMessages(messages);
  console.log("[AI Chat] Received", messages.length, "UI messages, converted to", modelMessages.length, "model messages");
  console.log("[AI Chat] Model messages roles:", modelMessages.map((m: { role: string }) => m.role));

  const result = streamText({
    model: openai("gpt-5.2"),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    stopWhen: stepCountIs(25),
    tools: {
      searchMovies: {
        description:
          "Search for a movie or TV series by title. Returns matching results with poster, year, type displayed as visual cards in the UI. Search one title at a time for best results.",
        inputSchema: zodSchema(searchInputSchema),
        execute: executeSearch,
      },
      searchTorrents: {
        description:
          "Search torrent sites (ThePirateBay, etc.) for available downloads. Returns a list of torrents with title, seeds, peers, size, and magnet URL. Use this BEFORE downloadTorrent so you can review the list and pick the correct torrent that matches what the user actually wants.",
        inputSchema: zodSchema(searchTorrentsInputSchema),
        execute: async ({ query }: z.infer<typeof searchTorrentsInputSchema>) => {
          console.log("[AI Tool] searchTorrents called with query:", query);
          const [torrentResults, tpbResults] = await Promise.all([
            searchTorrents(query, "Movies", 10).catch(() => []),
            searchTPB(query, 10).catch(() => []),
          ]);
          const all = [...torrentResults, ...tpbResults]
            .sort((a, b) => b.seeds - a.seeds)
            .slice(0, 15);
          console.log("[AI Tool] searchTorrents result:", all.length, "torrents");
          return {
            query,
            torrents: all.map((t) => ({
              title: t.title,
              seeds: t.seeds,
              peers: t.peers,
              size: t.size,
              provider: t.provider,
              magnet: t.magnet,
            })),
          };
        },
      },
      downloadTorrent: {
        description:
          "Send a magnet link to qBittorrent to start downloading. You MUST call searchTorrents first to get the torrent list, review it, and pick the correct matching torrent. Set contentType to 'movie' or 'series' for correct save path.",
        inputSchema: zodSchema(downloadInputSchema),
        execute: async ({ magnet, title, contentType, year, imdbId, poster, totalSeasons }: z.infer<typeof downloadInputSchema>) => {
          const savePath = contentType === "movie" ? "/mnt/storage/Movies" : "/mnt/storage/torrents";
          console.log("[AI Tool] downloadTorrent called for:", title, "→", savePath);
          try {
            // Call the download endpoint to ensure it's recorded in the library
            const downloadRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/torrents/download`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                magnet,
                title,
                year,
                type: contentType,
                imdbId,
                poster,
                totalSeasons,
              }),
            });
            
            if (downloadRes.ok) {
              const result = await downloadRes.json();
              return { success: true, message: result.message || `Started downloading: ${title}`, savePath };
            } else {
              const error = await downloadRes.json();
              return { success: false, message: error.error || "Failed to download" };
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            return { success: false, message: msg };
          }
        },
      },
    },
    onStepFinish: (event) => {
      console.log("[AI Chat] Step finished | tool calls:", event.toolCalls?.length ?? 0);
      if (event.toolCalls?.length) {
        for (const tc of event.toolCalls) {
          console.log("[AI Chat]   tool:", tc.toolName, "input:", JSON.stringify(tc.input));
        }
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
