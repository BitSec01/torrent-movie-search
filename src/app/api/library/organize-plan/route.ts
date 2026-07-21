import { NextRequest, NextResponse } from "next/server";
import { planFolders, type PlanRequest } from "@/lib/library/plan";

/**
 * POST /api/library/organize-plan
 * Produces a structured copy+rename plan for each torrent folder, for the user
 * to review before executing.
 * Body: { items: Array<{ folderName: string; downloadId?: string }> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: PlanRequest[] = body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }

    return NextResponse.json({ plans: await planFolders(items) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
