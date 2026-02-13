"use client";

import { useState, useCallback } from "react";
import { SearchForm, type SearchValues } from "./search-form";
import { MovieGrid, ViewModeToggle, type ViewMode } from "./movie-grid";
import { MovieDetailModal } from "./movie-detail-modal";
import { AiChat } from "./ai-chat";
import { useMovieSearch } from "@/hooks/use-movie-search";
import type { UnifiedSearchResult, TorrentLink } from "@/lib/api/types";

export function SearchPage() {
  const [searchParams, setSearchParams] = useState<SearchValues>({
    query: "",
    type: "",
    year: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [aiResults, setAiResults] = useState<UnifiedSearchResult[]>([]);

  const handleAiResults = useCallback((results: UnifiedSearchResult[]) => {
    setAiResults(results);
  }, []);

  const { data, isLoading, isFetching, error } = useMovieSearch({
    query: searchParams.query,
    type: searchParams.type || undefined,
    year: searchParams.year || undefined,
  });

  const handleSearch = (values: SearchValues) => {
    setSearchParams(values);
  };

  const hasSearched = searchParams.query.length > 0;

  // Find torrent links for the currently selected movie
  const allResults = [...(data?.results ?? []), ...aiResults];
  const selectedTorrents: TorrentLink[] = selectedId
    ? allResults.find((m) => m.imdbId === selectedId)?.torrentLinks ?? []
    : [];

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header / Hero */}
      <div className="relative overflow-hidden border-b border-zinc-800/50">
        <div className="absolute inset-0 bg-linear-to-b from-indigo-950/20 via-zinc-950 to-zinc-950" />
        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="bg-linear-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
              Torrent Browser
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-zinc-500">
              Search movies &amp; series from the 1980s to today. Explore details, cast, ratings and more.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl">
            <SearchForm
              onSearch={handleSearch}
              isLoading={isFetching}
              initialValues={searchParams}
            />
          </div>
        </div>
      </div>

      {/* Results area */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Status bar */}
        {hasSearched && data && !isLoading && (
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              Found <span className="font-medium text-zinc-300">{data.results.length}</span> result{data.results.length !== 1 ? "s" : ""}
              {data.totalResults && data.totalResults > data.results.length && (
                <> of <span className="font-medium text-zinc-300">{data.totalResults.toLocaleString()}</span> total</>
              )}
              {" "}for <span className="font-medium text-zinc-300">&ldquo;{searchParams.query}&rdquo;</span>
            </p>
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          </div>
        )}

        {/* Loading */}
        {isLoading && hasSearched && (
          <div className="flex flex-col items-center justify-center py-24">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-500">Searching across databases...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-6 text-center">
            <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
          </div>
        )}

        {/* Results grid */}
        {!isLoading && data && (
          <MovieGrid results={data.results} onSelect={setSelectedId} viewMode={viewMode} />
        )}

        {/* AI Recommended results */}
        {aiResults.length > 0 && !hasSearched && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                <svg className="mr-1.5 inline h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                AI found <span className="font-medium text-zinc-300">{aiResults.length}</span> recommendation{aiResults.length !== 1 ? "s" : ""}
              </p>
              <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            </div>
            <MovieGrid results={aiResults} onSelect={setSelectedId} viewMode={viewMode} />
          </>
        )}

        {/* Empty state (before search) */}
        {!hasSearched && aiResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-2xl bg-zinc-900/50 p-6 ring-1 ring-zinc-800">
              <svg className="mx-auto h-16 w-16 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 12 6 12.504 6 13.125" />
              </svg>
            </div>
            <p className="mt-6 text-lg font-medium text-zinc-400">Start by searching for a movie or series</p>
            <p className="mt-2 text-sm text-zinc-600">
              Try &ldquo;The Dark Knight&rdquo;, &ldquo;Breaking Bad&rdquo;, or &ldquo;Inception&rdquo;
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <MovieDetailModal imdbId={selectedId} torrentLinks={selectedTorrents} onClose={() => setSelectedId(null)} />

      {/* AI Chat */}
      <AiChat onResults={handleAiResults} />
    </div>
  );
}
