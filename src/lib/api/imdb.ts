import type { ImdbSearchResponse, ImdbDetailResponse } from "./types";

const BASE = "https://imdb.iamidiotareyoutoo.com";

export async function searchImdb(query: string): Promise<ImdbSearchResponse> {
  const url = `${BASE}/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`IMDb search failed: ${res.status}`);
  return res.json();
}

export async function getImdbDetail(tt: string): Promise<ImdbDetailResponse> {
  const url = `${BASE}/search?tt=${encodeURIComponent(tt)}`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`IMDb detail failed: ${res.status}`);
  return res.json();
}

export function imdbPosterUrl(tt: string, width = 300, height = 450): string {
  return `${BASE}/photo/${tt}?w=${width}&h=${height}`;
}
