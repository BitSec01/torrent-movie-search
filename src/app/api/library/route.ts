import { NextResponse } from "next/server";
import { db } from "@/db";
import { download } from "@/db/schema";
import { desc } from "drizzle-orm";

/**
 * GET /api/library
 * Returns all tracked downloads from the database.
 */
export async function GET() {
  try {
    const downloads = db
      .select()
      .from(download)
      .orderBy(desc(download.createdAt))
      .all();

    return NextResponse.json({ downloads });
  } catch (err) {
    console.error("[Library] error:", err);
    return NextResponse.json({ error: "Failed to fetch library" }, { status: 500 });
  }
}
