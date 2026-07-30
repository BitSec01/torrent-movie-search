"use client";

import { useState } from "react";
import Image from "next/image";
import type { UnifiedSearchResult } from "@/lib/api/types";
import { MovieCard } from "./movie-card";

export type ViewMode = "grid" | "list" | "year";

interface MovieGridProps {
  results: UnifiedSearchResult[];
  onSelect: (imdbId: string) => void;
  viewMode: ViewMode;
}

// ── View mode toggle icons ──

export function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const modes: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    {
      value: "grid",
      label: "Grid",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
    {
      value: "list",
      label: "List",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
        </svg>
      ),
    },
    {
      value: "year",
      label: "By Year",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center rounded-lg bg-zinc-900 p-1 ring-1 ring-zinc-800">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          title={m.label}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
            mode === m.value
              ? "bg-zinc-700 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {m.icon}
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Helpers ──

function groupByYear(results: UnifiedSearchResult[]) {
  const groups = new Map<string, UnifiedSearchResult[]>();

  for (const movie of results) {
    const year = movie.year?.match(/\d{4}/)?.[0] ?? "Unknown";
    const existing = groups.get(year);
    if (existing) {
      existing.push(movie);
    } else {
      groups.set(year, [movie]);
    }
  }

  return Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return Number(b) - Number(a);
  });
}

// ── Sub-components ──

function YearSection({
  year,
  movies,
  onSelect,
  defaultOpen,
}: {
  year: string;
  movies: UnifiedSearchResult[];
  onSelect: (imdbId: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full cursor-pointer items-center gap-2 text-left"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <h2 className="text-lg font-bold text-white">{year}</h2>
        <span className="text-sm text-zinc-500">
          ({movies.length} title{movies.length !== 1 ? "s" : ""})
        </span>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {movies.map((movie) => (
            <MovieCard key={movie.imdbId} movie={movie} onClick={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  movie: "text-blue-400",
  series: "text-emerald-400",
  episode: "text-amber-400",
};

function ListItem({
  movie,
  onClick,
}: {
  movie: UnifiedSearchResult;
  onClick: (imdbId: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(movie.imdbId)}
      className="flex w-full cursor-pointer items-center gap-4 rounded-xl bg-zinc-900 p-3 text-left ring-1 ring-zinc-800 transition-all hover:ring-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/10"
    >
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
        {movie.poster ? (
          <Image
            src={movie.poster}
            alt={movie.title}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <h3 className="truncate text-sm font-semibold text-white">{movie.title}</h3>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          {movie.year && <span className="text-zinc-400">{movie.year}</span>}
          {movie.type && (
            <span className={`font-medium ${TYPE_COLOR[movie.type] ?? "text-zinc-400"}`}>
              {movie.type.charAt(0).toUpperCase() + movie.type.slice(1)}
            </span>
          )}
        </div>
        {movie.plot && (
          <p className="mt-1 truncate text-xs text-zinc-500">{movie.plot}</p>
        )}
        {movie.torrentLinks && movie.torrentLinks.length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {movie.torrentLinks.length} torrent{movie.torrentLinks.length !== 1 ? "s" : ""} available
          </p>
        )}
      </div>
    </button>
  );
}

// ── Main component ──

export function MovieGrid({ results, onSelect, viewMode }: MovieGridProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg className="mb-4 h-16 w-16 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
        </svg>
        <p className="text-lg font-medium text-zinc-400">No results found</p>
        <p className="mt-1 text-sm text-zinc-600">Try a different search term or filter</p>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="space-y-2">
        {results.map((movie) => (
          <ListItem key={movie.imdbId} movie={movie} onClick={onSelect} />
        ))}
      </div>
    );
  }

  if (viewMode === "year") {
    const grouped = groupByYear(results);
    return (
      <div className="space-y-6">
        {grouped.map(([year, movies], idx) => (
          <YearSection
            key={year}
            year={year}
            movies={movies}
            onSelect={onSelect}
            defaultOpen={idx < 3}
          />
        ))}
      </div>
    );
  }

  // Default: grid
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {results.map((movie) => (
        <MovieCard key={movie.imdbId} movie={movie} onClick={onSelect} />
      ))}
    </div>
  );
}
