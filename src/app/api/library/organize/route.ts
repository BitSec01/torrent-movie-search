import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";

const TORRENTS_DIR = "/mnt/storage/torrents";

/**
 * POST /api/library/organize
 * Organises a single tracked download from the library.
 * Delegates to /api/library/organize-folder which is the shared implementation
 * used by both the Library tab and the Organise tab.
 * Body: { downloadId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const downloadId = body.downloadId;

    let target;
    if (downloadId) {
      target = db.select().from(download).where(eq(download.id, downloadId)).get();
    } else {
      target = db.select().from(download).where(eq(download.status, "completed")).get();
    }

    if (!target) {
      return NextResponse.json({ message: "No downloads ready to organise" });
    }

    if (target.status !== "completed" && target.status !== "failed") {
      return NextResponse.json(
        { error: `Download is in "${target.status}" state, must be "completed" or "failed" to organise` },
        { status: 400 }
      );
    }

    // Determine the folder name inside /mnt/storage/torrents/
    const folderName = target.torrentName || (
      target.originalPath?.startsWith(TORRENTS_DIR)
        ? target.originalPath.slice(TORRENTS_DIR.length + 1)
        : null
    );

    if (!folderName) {
      return NextResponse.json(
        { error: "Cannot determine torrent folder name — try running Check Status first" },
        { status: 400 }
      );
    }

    // Delegate to the shared organize-folder endpoint
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const res = await fetch(`${appUrl}/api/library/organize-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName, downloadId: target.id }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Organisation failed" },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      downloadId: target.id,
      destination: data.destination,
      logs: data.logs,
    });

  } catch (err) {
    console.error("[Organize] error:", err);
    return NextResponse.json(
      { error: "Failed to organise download" },
      { status: 500 }
    );
  }
}
