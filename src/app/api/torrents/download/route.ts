import { NextRequest, NextResponse } from "next/server";
import { addDownload } from "@/lib/library/add-download";

export async function POST(req: NextRequest) {
  try {
    const { magnet, title, year, type, imdbId, poster, totalSeasons } = await req.json();

    if (!magnet || typeof magnet !== "string" || !magnet.startsWith("magnet:")) {
      return NextResponse.json(
        { error: "A valid magnet link is required" },
        { status: 400 }
      );
    }

    const result = await addDownload({ magnet, title, year, type, imdbId, poster, totalSeasons });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    return NextResponse.json({ message: result.message });
  } catch (err) {
    console.error("[qBittorrent] download error:", err);
    const message = err instanceof Error ? err.message : "Failed to add torrent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
