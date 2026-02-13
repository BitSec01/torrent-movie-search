import type { OmdbSearchResponse, OmdbDetailResponse } from "./types";

const BASE = "https://www.omdbapi.com";

function apiKey(): string {
  const key = process.env.OMDB_API_KEY;
  if (!key) throw new Error("OMDB_API_KEY is not set");
  return key;
}

export async function searchOmdb(
  query: string,
  options?: { type?: string; year?: string; page?: number }
): Promise<OmdbSearchResponse> {
  const params = new URLSearchParams({
    apikey: apiKey(),
    s: query,
    r: "json",
  });
  if (options?.type) params.set("type", options.type);
  if (options?.year) params.set("y", options.year);
  if (options?.page) params.set("page", String(options.page));

  const res = await fetch(`${BASE}/?${params}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`OMDB search failed: ${res.status}`);
  return res.json();
}

export async function getOmdbDetail(
  imdbId: string,
  plot: "short" | "full" = "full"
): Promise<OmdbDetailResponse> {
  const params = new URLSearchParams({
    apikey: apiKey(),
    i: imdbId,
    plot,
    r: "json",
  });
  const res = await fetch(`${BASE}/?${params}`, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`OMDB detail failed: ${res.status}`);
  return res.json();
}
