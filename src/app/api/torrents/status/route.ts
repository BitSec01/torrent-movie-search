import { NextResponse } from "next/server";
import { getTorrentsInfo } from "@/lib/api/qbittorrent";

/** Map qBittorrent state to our simplified status */
function mapState(state: string, progress: number): string {
  if (progress >= 1) return "completed";
  switch (state) {
    case "downloading":
    case "stalledDL":
    case "forcedDL":
    case "metaDL":
    case "allocating":
      return "downloading";
    case "uploading":
    case "stalledUP":
    case "forcedUP":
      return "completed";
    case "pausedDL":
    case "pausedUP":
      return "paused";
    case "error":
      return "error";
    case "missingFiles":
      return "missing";
    case "queuedDL":
    case "queuedUP":
    case "checkingDL":
    case "checkingUP":
    case "checkingResumeData":
    case "moving":
      return "queued";
    default:
      return "downloading";
  }
}

/**
 * GET /api/torrents/status
 * Queries qBittorrent for ALL torrents and returns a simplified list.
 * No database involved — the source of truth is qBittorrent itself.
 */
export async function GET() {
  try {
    const infos = await getTorrentsInfo();

    const torrents = infos.map((t) => ({
      hash: t.hash.toLowerCase(),
      name: t.name,
      status: mapState(t.state, t.progress),
      progress: t.progress,
      dlspeed: t.dlspeed,
      upspeed: t.upspeed,
      seeds: t.num_seeds,
      peers: t.num_leechs,
      eta: t.eta < 8640000 ? t.eta : null,
      size: t.size,
    }));

    return NextResponse.json({ torrents });
  } catch (err) {
    console.error("[Status] error:", err);
    return NextResponse.json({ error: "Failed to query qBittorrent" }, { status: 500 });
  }
}
