import { NextResponse } from "next/server";
import { runAutoOrganize } from "@/lib/library/auto-organize";

/**
 * POST /api/library/auto-organize
 * Runs one unattended sweep on demand. The scheduler calls the same function
 * directly; this endpoint exists for manual triggering and for cron setups.
 */
export async function POST() {
  try {
    const result = await runAutoOrganize((message) => console.log("[Auto-organize]", message));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Auto-organize] error:", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
