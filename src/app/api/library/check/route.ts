import { NextResponse } from "next/server";
import { syncDownloadStatuses } from "@/lib/library/sync";

/**
 * POST /api/library/check
 * Reconciles tracked downloads with qBittorrent: marks finished torrents
 * "completed", drops rows whose torrent was deleted, and backfills metadata.
 */
export async function POST() {
  try {
    return NextResponse.json(await syncDownloadStatuses());
  } catch (err) {
    console.error("[Library Check] error:", err);
    return NextResponse.json({ error: "Failed to check download status" }, { status: 500 });
  }
}
