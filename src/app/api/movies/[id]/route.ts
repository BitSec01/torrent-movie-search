import { NextRequest, NextResponse } from "next/server";
import { getImdbDetail } from "@/lib/api/imdb";
import { getOmdbDetail } from "@/lib/api/omdb";
import { mergeDetail } from "@/lib/api/merge";

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
    const [imdbRes, omdbRes] = await Promise.allSettled([
      getImdbDetail(id),
      getOmdbDetail(id, "full"),
    ]);

    const imdb = imdbRes.status === "fulfilled" ? imdbRes.value : null;
    const omdb =
      omdbRes.status === "fulfilled" && omdbRes.value.Response === "True"
        ? omdbRes.value
        : null;

    const detail = mergeDetail(imdb, omdb);

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
