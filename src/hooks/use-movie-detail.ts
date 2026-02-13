"use client";

import { useQuery } from "@tanstack/react-query";
import type { UnifiedDetail } from "@/lib/api/types";

export function useMovieDetail(imdbId: string | null) {
  return useQuery<UnifiedDetail>({
    queryKey: ["movieDetail", imdbId],
    queryFn: async () => {
      const res = await fetch(`/api/movies/${imdbId}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      return res.json();
    },
    enabled: !!imdbId,
    staleTime: 10 * 60 * 1000,
  });
}
