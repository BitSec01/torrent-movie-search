import { NextRequest, NextResponse } from "next/server";
import { searchImdb } from "@/lib/api/imdb";
import { searchOmdb } from "@/lib/api/omdb";
import { mergeSearchResults } from "@/lib/api/merge";
import { searchTorrents } from "@/lib/api/torrent";
import { searchTPB } from "@/lib/api/tpb-scraper";

/** Strip punctuation & collapse whitespace for fuzzy title matching */
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  const type = searchParams.get("type") || undefined;
  const year = searchParams.get("year") || undefined;
  const page = searchParams.get("page") || undefined;

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 }
    );
  }

  try {
    const shouldQueryOmdb = query.length >= 3;

    // Run all searches in parallel
    const [imdbRes, omdbRes, torrentResults, tpbResults] = await Promise.all([
      searchImdb(query).catch((err) => {
        console.error("[IMDb] search error:", err);
        return null;
      }),
      shouldQueryOmdb
        ? searchOmdb(query, {
            type: type || undefined,
            year: year || undefined,
            page: page ? Number(page) : undefined,
          }).catch((err) => {
            console.error("[OMDB] search error:", err);
            return null;
          })
        : Promise.resolve(null),
      searchTorrents(query, type === "series" ? "TV" : "Movies", 20).catch((err) => {
        console.error("[Torrent] search error:", err);
        return [];
      }),
      searchTPB(query, 5).catch((err) => {
        console.error("[TPB] search error:", err);
        return [];
      }),
    ]);

    // Combine torrent-search-api results with TPB scraper results
    const allTorrents = [...torrentResults, ...tpbResults];

    console.log(`[Search] q="${query}" | IMDb ok=${imdbRes?.ok}, results=${imdbRes?.description?.length ?? 0} | OMDB queried=${shouldQueryOmdb}, response=${omdbRes?.Response}, results=${omdbRes?.Search?.length ?? 0} | torrents=${torrentResults.length} | tpb=${tpbResults.length}`);

    const imdbResults =
      imdbRes?.ok ? imdbRes.description ?? [] : [];

    const omdbResults =
      omdbRes?.Response === "True" ? omdbRes.Search ?? [] : [];

    const totalResults =
      omdbRes?.totalResults ? Number(omdbRes.totalResults) : undefined;

    const merged = mergeSearchResults(imdbResults, omdbResults);

    // Attach torrent links to matching movies by fuzzy title match
    for (const movie of merged) {
      const movieTitle = norm(movie.title);
      const matching = allTorrents.filter((t) => {
        const tTitle = norm(t.title);
        const tBase = norm(t.title.split(/\s*[\(\[\{]/)[0] ?? "");
        return tTitle.includes(movieTitle) || movieTitle.includes(tBase);
      });
      if (matching.length > 0) {
        // Sort by seeds descending and deduplicate by magnet hash
        matching.sort((a, b) => b.seeds - a.seeds);
        movie.torrentLinks = matching;
      }
    }

    // If any torrents didn't match a movie, attach them to the first result as extras
    console.log(`[Search] q="${query}" | merged=${merged.length} results`);

    return NextResponse.json({ results: merged, totalResults });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json(
      { error: "Failed to search movies" },
      { status: 500 }
    );
  }
}
