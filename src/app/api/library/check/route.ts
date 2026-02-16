import { NextResponse } from "next/server";
import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTorrentsInfo } from "@/lib/api/qbittorrent";

/**
 * POST /api/library/check
 * Polls qBittorrent for all torrents, updates the DB status for tracked downloads.
 * Marks downloads as "completed" when qBittorrent reports them done.
 */
export async function POST() {
  try {
    // Get all downloads that are still in "downloading" state
    const pendingDownloads = db
      .select()
      .from(download)
      .where(eq(download.status, "downloading"))
      .all();

    if (pendingDownloads.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    // Query qBittorrent for these hashes
    const hashes = pendingDownloads.map((d) => d.hash);
    const torrentsInfo = await getTorrentsInfo(hashes);

    let updated = 0;
    const now = new Date();

    for (const d of pendingDownloads) {
      const info = torrentsInfo.find(
        (t) => t.hash.toLowerCase() === d.hash.toLowerCase()
      );
      if (!info) continue;

      const isComplete = info.progress >= 1 || 
        ["uploading", "stalledUP", "forcedUP", "pausedUP"].includes(info.state);

      if (isComplete) {
        db.update(download)
          .set({
            status: "completed",
            torrentName: info.name,
            originalPath: `${info.save_path}/${info.name}`.replace(/\/\//g, "/"),
            updatedAt: now,
          })
          .where(eq(download.id, d.id))
          .run();
        updated++;
      } else if (!d.torrentName && info.name) {
        // Update the torrent name even if not yet complete
        db.update(download)
          .set({
            torrentName: info.name,
            originalPath: `${info.save_path}/${info.name}`.replace(/\/\//g, "/"),
            updatedAt: now,
          })
          .where(eq(download.id, d.id))
          .run();
      }
    }

    return NextResponse.json({ updated, checked: pendingDownloads.length });
  } catch (err) {
    console.error("[Library Check] error:", err);
    return NextResponse.json(
      { error: "Failed to check download status" },
      { status: 500 }
    );
  }
}
