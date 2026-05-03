import { NextResponse } from "next/server";
import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/library/[id]
 * Removes the tracked download from the library. Does NOT touch qBittorrent
 * or any files on disk — this only stops tracking it in the library UI.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const target = db.select().from(download).where(eq(download.id, id)).get();
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    db.delete(download).where(eq(download.id, id)).run();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[Library Delete] error:", err);
    return NextResponse.json({ error: "Failed to delete download" }, { status: 500 });
  }
}
