import { NextRequest, NextResponse } from "next/server";
import { searchTitles } from "@/lib/api/metadata";
import { searchTorrents } from "@/lib/api/torrent";
import { searchTPB } from "@/lib/api/tpb-scraper";
import { attachTorrentLinks } from "@/lib/api/torrent-match";

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
    const [metadata, torrentResults, tpbResults] = await Promise.all([
      searchTitles(query, { type, year, page: page ? Number(page) : undefined }),
      searchTorrents(query, type === "series" ? "TV" : "Movies", 20).catch((err) => {
        console.error("[Torrent] search error:", err);
        return [];
      }),
      searchTPB(query, 5).catch((err) => {
        console.error("[TPB] search error:", err);
        return [];
      }),
    ]);

    const results = attachTorrentLinks(metadata.results, [...torrentResults, ...tpbResults]);

    console.log(
      `[Search] q="${query}" | titles=${results.length} | torrents=${torrentResults.length} | tpb=${tpbResults.length}`
    );

    return NextResponse.json({ results, totalResults: metadata.totalResults });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json(
      { error: "Failed to search movies" },
      { status: 500 }
    );
  }
}
