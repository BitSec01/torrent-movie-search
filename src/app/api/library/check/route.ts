import { NextResponse } from "next/server";
import { db } from "@/db";
import { download } from "@/db/schema";
import { eq, or, isNull, inArray } from "drizzle-orm";
import { getTorrentsInfo } from "@/lib/api/qbittorrent";
import { searchOmdb } from "@/lib/api/omdb";

/**
 * POST /api/library/check
 * Polls qBittorrent for all torrents, updates the DB status for tracked downloads.
 * Marks downloads as "completed" when qBittorrent reports them done.
 * Removes tracked downloads whose torrent has been deleted from qBittorrent
 * (except those already "organized" — those have a destination path independent
 * of the torrent and should be kept until the user manually removes them).
 * Also enriches downloads that are missing poster/imdbId via OMDB.
 */
export async function POST() {
  try {
    // Pull every torrent qBittorrent knows about so we can both update status
    // and detect torrents that have been removed.
    const allTorrents = await getTorrentsInfo();
    const qbtHashes = new Set(allTorrents.map((t) => t.hash.toLowerCase()));

    // Drop tracked downloads whose torrent no longer exists in qBittorrent.
    // Skip "organized" rows — those have already been moved into the library
    // and may legitimately have had their torrent removed.
    const allTracked = db.select().from(download).all();
    const orphanedIds = allTracked
      .filter((d) => d.status !== "organized" && !qbtHashes.has(d.hash.toLowerCase()))
      .map((d) => d.id);
    let removed = 0;
    if (orphanedIds.length > 0) {
      const result = db
        .delete(download)
        .where(inArray(download.id, orphanedIds))
        .run();
      removed = result.changes ?? orphanedIds.length;
    }

    // Update status for downloads that are still in "downloading" state.
    const pendingDownloads = db
      .select()
      .from(download)
      .where(eq(download.status, "downloading"))
      .all();

    if (pendingDownloads.length > 0) {
      const now = new Date();

      for (const d of pendingDownloads) {
        const info = allTorrents.find(
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
    }

    // Enrich any downloads missing poster or imdbId via OMDB
    const unenriched = db
      .select()
      .from(download)
      .where(or(isNull(download.poster), isNull(download.imdbId)))
      .all();

    let enriched = 0;
    for (const d of unenriched) {
      try {
        const query = d.year ? `${d.title} ${d.year}` : d.title;
        const omdbRes = await searchOmdb(query, {
          type: d.type === "series" ? "series" : "movie",
        });
        if (omdbRes.Response === "True" && omdbRes.Search && omdbRes.Search.length > 0) {
          const match = omdbRes.Search[0];
          const newImdbId = !d.imdbId && match.imdbID ? match.imdbID : d.imdbId;
          const newPoster = !d.poster && match.Poster && match.Poster !== "N/A" ? match.Poster : d.poster;
          const newYear = !d.year && match.Year ? match.Year : d.year;
          if (newImdbId !== d.imdbId || newPoster !== d.poster || newYear !== d.year) {
            db.update(download)
              .set({ imdbId: newImdbId, poster: newPoster, year: newYear, updatedAt: new Date() })
              .where(eq(download.id, d.id))
              .run();
            enriched++;
          }
        }
      } catch {
        // Non-fatal: skip enrichment for this download
      }
    }

    return NextResponse.json({
      updated: pendingDownloads.length,
      checked: pendingDownloads.length,
      enriched,
      removed,
    });
  } catch (err) {
    console.error("[Library Check] error:", err);
    return NextResponse.json(
      { error: "Failed to check download status" },
      { status: 500 }
    );
  }
}
