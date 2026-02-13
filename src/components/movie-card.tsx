"use client";

import Image from "next/image";
import type { UnifiedSearchResult } from "@/lib/api/types";

interface MovieCardProps {
  movie: UnifiedSearchResult;
  onClick: (imdbId: string) => void;
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  movie: { label: "Movie", color: "bg-blue-600" },
  series: { label: "Series", color: "bg-emerald-600" },
  episode: { label: "Episode", color: "bg-amber-600" },
};

export function MovieCard({ movie, onClick }: MovieCardProps) {
  const badge = TYPE_BADGE[movie.type] ?? { label: movie.type, color: "bg-zinc-600" };

  return (
    <button
      onClick={() => onClick(movie.imdbId)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-800 transition-all hover:ring-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      {/* Poster */}
      <div className="relative aspect-2/3 w-full overflow-hidden bg-zinc-800">
        {movie.poster ? (
          <Image
            src={movie.poster}
            alt={movie.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
            </svg>
          </div>
        )}

        {/* Type badge */}
        <span className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-xs font-semibold text-white ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {/* Torrent badge */}
      {movie.torrentLinks && movie.torrentLinks.length > 0 && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {movie.torrentLinks.length}
        </span>
      )}

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-3 text-left">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white group-hover:text-indigo-300">
          {movie.title}
        </h3>
        <div className="flex items-center gap-2">
          {movie.year && (
            <span className="text-xs text-zinc-400">{movie.year}</span>
          )}
          {movie.torrentLinks && movie.torrentLinks.length > 0 && (
            <span className="text-xs text-emerald-400">
              {movie.torrentLinks.length} torrent{movie.torrentLinks.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {movie.cast && (
          <p className="mt-auto line-clamp-1 text-xs text-zinc-500">
            {movie.cast}
          </p>
        )}
      </div>
    </button>
  );
}
