import { NextRequest, NextResponse } from "next/server";
import { inspectDestination } from "@/lib/library/destination";

interface Query {
  folderName: string;
  destinationBase: string;
  rootFolder: string;
}

/**
 * POST /api/library/destination-info
 * Reports what already exists at each planned destination so the review modal
 * can ask whether to merge or replace. Re-queried when the user edits a root
 * folder name, since that changes which destination is being targeted.
 * Body: { items: Query[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: Query[] = body.items;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }

    const results = await Promise.all(
      items.map(async ({ folderName, destinationBase, rootFolder }) => ({
        folderName,
        ...(await inspectDestination(destinationBase, rootFolder)),
      }))
    );

    return NextResponse.json({ destinations: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
