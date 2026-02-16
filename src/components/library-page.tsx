"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

interface Download {
  id: string;
  hash: string;
  title: string;
  year: string | null;
  type: string;
  imdbId: string | null;
  poster: string | null;
  totalSeasons: string | null;
  torrentName: string | null;
  originalPath: string | null;
  destinationPath: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

type FilterStatus = "all" | "downloading" | "completed" | "organized" | "failed";

export function LibraryPage() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [organizing, setOrganizing] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (res.ok) {
        const data = await res.json();
        setDownloads(data.downloads ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
    const timer = setInterval(fetchLibrary, 10000);
    return () => clearInterval(timer);
  }, [fetchLibrary]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await fetch("/api/library/check", { method: "POST" });
      await fetchLibrary();
    } finally {
      setChecking(false);
    }
  };

  const handleOrganize = async (downloadId: string) => {
    setOrganizing(downloadId);
    try {
      const res = await fetch("/api/library/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadId }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Organize]", data.error);
      }
      await fetchLibrary();
    } finally {
      setOrganizing(null);
    }
  };

  const handleOrganizeAll = async () => {
    const completedDownloads = downloads.filter((d) => d.status === "completed");
    for (const d of completedDownloads) {
      setOrganizing(d.id);
      try {
        await fetch("/api/library/organize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadId: d.id }),
        });
        await fetchLibrary();
      } catch {
        // continue with next
      }
    }
    setOrganizing(null);
  };

  const filtered = filter === "all" ? downloads : downloads.filter((d) => d.status === filter);
  const movies = filtered.filter((d) => d.type === "movie");
  const series = filtered.filter((d) => d.type === "series");

  const statusCounts = {
    all: downloads.length,
    downloading: downloads.filter((d) => d.status === "downloading").length,
    completed: downloads.filter((d) => d.status === "completed").length,
    organized: downloads.filter((d) => d.status === "organized").length,
    failed: downloads.filter((d) => d.status === "failed" || d.status === "organizing").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-zinc-800/50">
        <div className="absolute inset-0 bg-linear-to-b from-emerald-950/20 via-zinc-950 to-zinc-950" />
        <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-16 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="bg-linear-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
                Library
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                {downloads.length} download{downloads.length !== 1 ? "s" : ""} tracked
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCheck}
                disabled={checking}
                className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
              >
                <svg className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                {checking ? "Checking..." : "Check Status"}
              </button>
              {statusCounts.completed > 0 && (
                <button
                  onClick={handleOrganizeAll}
                  disabled={!!organizing}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600/20 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-600/30 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                  </svg>
                  Organize All ({statusCounts.completed})
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="mt-6 flex gap-1">
            {(["all", "downloading", "completed", "organized", "failed"] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === s
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {statusCounts[s] > 0 && (
                  <span className="ml-1.5 rounded-full bg-zinc-600/50 px-1.5 py-0.5 text-[10px]">
                    {statusCounts[s]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-500">Loading library...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-2xl bg-zinc-900/50 p-6 ring-1 ring-zinc-800">
              <svg className="mx-auto h-16 w-16 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
              </svg>
            </div>
            <p className="mt-6 text-lg font-medium text-zinc-400">
              {filter === "all" ? "No downloads yet" : `No ${filter} downloads`}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              Download movies or series from the search page to see them here.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Movies section */}
            {movies.length > 0 && (
              <Section title="Movies" count={movies.length}>
                {movies.map((d) => (
                  <DownloadCard
                    key={d.id}
                    download={d}
                    organizing={organizing === d.id}
                    onOrganize={() => handleOrganize(d.id)}
                  />
                ))}
              </Section>
            )}

            {/* Series section */}
            {series.length > 0 && (
              <Section title="Series" count={series.length}>
                {series.map((d) => (
                  <DownloadCard
                    key={d.id}
                    download={d}
                    organizing={organizing === d.id}
                    onOrganize={() => handleOrganize(d.id)}
                  />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-200">
        {title}
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    downloading: "bg-blue-600/20 text-blue-400",
    completed: "bg-amber-600/20 text-amber-400",
    organizing: "bg-purple-600/20 text-purple-400",
    organized: "bg-emerald-600/20 text-emerald-400",
    failed: "bg-red-600/20 text-red-400",
  };

  return (
    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[status] ?? "bg-zinc-700 text-zinc-400"}`}>
      {status}
    </span>
  );
}

function DownloadCard({
  download: d,
  organizing,
  onOrganize,
}: {
  download: Download;
  organizing: boolean;
  onOrganize: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition hover:border-zinc-700">
      <div className="flex gap-3 p-3">
        {/* Poster */}
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
          {d.poster ? (
            <Image
              src={d.poster}
              alt={d.title}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-600">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-200">
              {d.title}
            </h3>
            <StatusBadge status={d.status} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            {d.year && (
              <span className="text-xs text-zinc-500">{d.year}</span>
            )}
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {d.type}
            </span>
          </div>

          {d.torrentName && (
            <p className="mt-1 truncate text-[11px] text-zinc-600" title={d.torrentName}>
              {d.torrentName}
            </p>
          )}

          {d.destinationPath && (
            <p className="mt-1 truncate text-[11px] text-emerald-500/70" title={d.destinationPath}>
              → {d.destinationPath}
            </p>
          )}

          {d.errorMessage && (
            <p className="mt-1 truncate text-[11px] text-red-400" title={d.errorMessage}>
              {d.errorMessage}
            </p>
          )}

          {/* Actions */}
          <div className="mt-2 flex items-center gap-2">
            {d.status === "completed" && (
              <button
                onClick={onOrganize}
                disabled={organizing}
                className="flex items-center gap-1 rounded-md bg-emerald-600/20 px-2.5 py-1 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-600/30 disabled:opacity-50"
              >
                {organizing ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                    Organizing...
                  </>
                ) : (
                  <>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                    </svg>
                    Organize
                  </>
                )}
              </button>
            )}
            {d.status === "failed" && (
              <button
                onClick={onOrganize}
                disabled={organizing}
                className="flex items-center gap-1 rounded-md bg-amber-600/20 px-2.5 py-1 text-[11px] font-medium text-amber-400 transition hover:bg-amber-600/30 disabled:opacity-50"
              >
                Retry
              </button>
            )}
            {d.imdbId && (
              <a
                href={`https://www.imdb.com/title/${d.imdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-zinc-500 transition hover:text-zinc-300"
              >
                IMDb
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
