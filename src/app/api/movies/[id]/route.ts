import { NextRequest, NextResponse } from "next/server";
import { getTitleDetail } from "@/lib/api/metadata";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !id.startsWith("tt")) {
    return NextResponse.json(
      { error: "Valid IMDb ID is required (e.g. tt1285016)" },
      { status: 400 }
    );
  }

  try {
    const detail = await getTitleDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Title not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("Detail error:", err);
    return NextResponse.json(
      { error: "Failed to fetch title details" },
      { status: 500 }
    );
  }
}
