import { NextRequest, NextResponse } from "next/server";
import { addTorrent, extractHash } from "@/lib/api/qbittorrent";
import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { magnet, title, year, type, imdbId, poster, totalSeasons } = await req.json();

    if (!magnet || typeof magnet !== "string" || !magnet.startsWith("magnet:")) {
      return NextResponse.json(
        { error: "A valid magnet link is required" },
        { status: 400 }
      );
    }

    const result = await addTorrent(magnet);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 502 }
      );
    }

    // Record in database if we have metadata
    const hash = extractHash(magnet);
    if (hash && title) {
      const now = new Date();
      const existing = db.select().from(download).where(eq(download.hash, hash)).get();
      if (!existing) {
        db.insert(download).values({
          id: randomUUID(),
          hash,
          magnet,
          title: title || "Unknown",
          year: year || null,
          type: type || "movie",
          imdbId: imdbId || null,
          poster: poster || null,
          totalSeasons: totalSeasons || null,
          status: "downloading",
          createdAt: now,
          updatedAt: now,
        }).run();
      }
    }

    return NextResponse.json({ message: result.message });
  } catch (err) {
    console.error("[qBittorrent] download error:", err);
    const message = err instanceof Error ? err.message : "Failed to add torrent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
