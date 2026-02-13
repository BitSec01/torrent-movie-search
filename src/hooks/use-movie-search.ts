"use client";

import { useQuery } from "@tanstack/react-query";
import type { UnifiedSearchResult } from "@/lib/api/types";

interface SearchParams {
  query: string;
  type?: string;
  year?: string;
  page?: number;
}

interface SearchResponse {
  results: UnifiedSearchResult[];
  totalResults?: number;
}

export function useMovieSearch(params: SearchParams) {
  return useQuery<SearchResponse>({
    queryKey: ["movieSearch", params],
    queryFn: async () => {
      const sp = new URLSearchParams();
      sp.set("q", params.query);
      if (params.type) sp.set("type", params.type);
      if (params.year) sp.set("year", params.year);
      if (params.page) sp.set("page", String(params.page));

      const res = await fetch(`/api/movies/search?${sp}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: params.query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
