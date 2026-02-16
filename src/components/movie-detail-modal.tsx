"use client";

import Image from "next/image";
import { useEffect, useCallback, useState } from "react";
import { useMovieDetail } from "@/hooks/use-movie-detail";
import { useTorrentStatuses, extractHash, type TorrentStatus } from "@/hooks/use-download-status";
import type { TorrentLink } from "@/lib/api/types";

interface MovieMeta {
  title: string;
  year: string;
  type: string;
  imdbId: string;
  poster: string | null;
  totalSeasons?: string;
}

interface MovieDetailModalProps {
  imdbId: string | null;
  torrentLinks?: TorrentLink[];
  onClose: () => void;
}

export function MovieDetailModal({ imdbId, torrentLinks, onClose }: MovieDetailModalProps) {
  // Poll qBittorrent only while the modal is open
  const { statusMap } = useTorrentStatuses(!!imdbId);

  // Check if any of this movie's torrents are already in qBittorrent
  const matchedTorrents = (torrentLinks ?? [])
    .map((t) => {
      if (!t.magnet) return null;
      const hash = extractHash(t.magnet);
      if (!hash) return null;
      return statusMap.get(hash) ?? null;
    });

  const anyDownloaded = matchedTorrents.some((s) => s?.status === "completed");
  const anyActive = matchedTorrents.some(
    (s) => s && s.status !== "completed"
  );
  const { data: detail, isLoading, error } = useMovieDetail(imdbId);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (imdbId) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [imdbId, handleKeyDown]);

  if (!imdbId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 my-8 w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-20 rounded-full bg-black/60 p-2 text-zinc-400 backdrop-blur transition hover:bg-black/80 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {isLoading && (
            <div className="flex items-center justify-center py-32">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="p-8 text-center text-red-400">
              Failed to load details. Please try again.
            </div>
          )}

          {detail && (
            <>
              {/* Hero section */}
              <div className="flex flex-col gap-6 p-6 sm:flex-row sm:p-8">
                {/* Poster */}
                <div className="relative mx-auto w-48 shrink-0 overflow-hidden rounded-xl bg-zinc-800 shadow-lg sm:mx-0 sm:w-56">
                  <div className="aspect-2/3">
                    {detail.poster ? (
                      <Image
                        src={detail.poster}
                        alt={detail.title}
                        fill
                        sizes="224px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-600">
                        <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 space-y-3">
                  <h2 className="text-2xl font-bold text-white sm:text-3xl">{detail.title}</h2>

                  {/* Meta chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.year && (
                      <span className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300">
                        {detail.year}
                      </span>
                    )}
                    {detail.rated && (
                      <span className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300">
                        {detail.rated}
                      </span>
                    )}
                    {detail.runtime && (
                      <span className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300">
                        {detail.runtime}
                      </span>
                    )}
                    {detail.type && (
                      <span className="rounded-md bg-indigo-600/20 px-2.5 py-1 text-xs font-semibold text-indigo-400">
                        {detail.type.charAt(0).toUpperCase() + detail.type.slice(1)}
                      </span>
                    )}
                    {detail.totalSeasons && (
                      <span className="rounded-md bg-emerald-600/20 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                        {detail.totalSeasons} Season{Number(detail.totalSeasons) !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Genres */}
                  {detail.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.genres.map((g) => (
                        <span
                          key={g}
                          className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Ratings */}
                  {(detail.imdbRating || detail.ratings.length > 0) && (
                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      {detail.imdbRating && (
                        <div className="flex items-center gap-1.5">
                          <svg className="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-lg font-bold text-white">{detail.imdbRating}</span>
                          <span className="text-xs text-zinc-500">/10</span>
                          {detail.imdbVotes && (
                            <span className="text-xs text-zinc-500">({detail.imdbVotes})</span>
                          )}
                        </div>
                      )}
                      {detail.ratings
                        .filter((r) => r.source !== "Internet Movie Database")
                        .map((r) => (
                          <div key={r.source} className="text-xs text-zinc-400">
                            <span className="font-medium text-zinc-300">{r.source}:</span> {r.value}
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Plot */}
                  {detail.plot && (
                    <p className="pt-2 text-sm leading-relaxed text-zinc-300">
                      {detail.plot}
                    </p>
                  )}
                </div>
              </div>

              {/* Additional info */}
              <div className="border-t border-zinc-800/80 bg-zinc-900/50 px-6 py-5 sm:px-8">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {detail.director && (
                    <InfoRow label="Director" value={detail.director} />
                  )}
                  {detail.writer && (
                    <InfoRow label="Writer" value={detail.writer} />
                  )}
                  {detail.actors && (
                    <InfoRow label="Cast" value={detail.actors} />
                  )}
                  {detail.language && (
                    <InfoRow label="Language" value={detail.language} />
                  )}
                  {detail.country && (
                    <InfoRow label="Country" value={detail.country} />
                  )}
                  {detail.released && (
                    <InfoRow label="Released" value={detail.released} />
                  )}
                  {detail.awards && (
                    <InfoRow label="Awards" value={detail.awards} />
                  )}
                  {detail.boxOffice && (
                    <InfoRow label="Box Office" value={detail.boxOffice} />
                  )}
                </div>

                {/* Links */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <a
                    href={`https://www.imdb.com/title/${detail.imdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-500 transition hover:bg-yellow-500/20"
                  >
                    View on IMDb
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                </div>

                {/* Already downloaded / downloading warning */}
                {(anyDownloaded || anyActive) && (
                  <div className={`mt-5 flex items-center gap-2 rounded-lg border p-3 ${
                    anyDownloaded
                      ? "border-emerald-800/50 bg-emerald-950/50"
                      : "border-blue-800/50 bg-blue-950/50"
                  }`}>
                    {anyDownloaded ? (
                      <svg className="h-5 w-5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 shrink-0 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                      </svg>
                    )}
                    <span className={`text-sm font-medium ${
                      anyDownloaded ? "text-emerald-400" : "text-blue-400"
                    }`}>
                      {anyDownloaded
                        ? "A torrent for this content was already downloaded"
                        : "A torrent for this content is currently downloading"}
                    </span>
                  </div>
                )}

                {/* Torrent links */}
                {torrentLinks && torrentLinks.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Available Torrents
                    </h3>
                    <div className="space-y-2">
                      {torrentLinks.map((t, i) => (
                        <TorrentRow
                          key={i}
                          torrent={t}
                          qbtStatus={matchedTorrents[i] ?? undefined}
                          movieMeta={detail ? {
                            title: detail.title,
                            year: detail.year,
                            type: detail.type,
                            imdbId: detail.imdbId,
                            poster: detail.poster,
                            totalSeasons: detail.totalSeasons,
                          } : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec > 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
  if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec} B/s`;
}

function formatEta(seconds: number): string {
  if (seconds > 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds > 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function TorrentInlineStatus({ status }: { status: TorrentStatus }) {
  const pct = Math.round(status.progress * 100);
  const isComplete = status.status === "completed";
  const isActive = status.status === "downloading";

  if (isComplete) {
    return (
      <span className="flex items-center gap-1 font-medium text-emerald-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Downloaded
      </span>
    );
  }

  if (isActive) {
    return (
      <span className="flex items-center gap-1 font-medium text-blue-400">
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
        {pct}%
        {status.dlspeed > 0 && ` · ${formatSpeed(status.dlspeed)}`}
        {status.eta != null && status.eta > 0 && ` · ${formatEta(status.eta)}`}
      </span>
    );
  }

  const label = status.status.charAt(0).toUpperCase() + status.status.slice(1);
  return (
    <span className="flex items-center gap-1 font-medium text-amber-400">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {label} {pct > 0 && `${pct}%`}
    </span>
  );
}

function TorrentRow({ torrent: t, qbtStatus, movieMeta }: { torrent: TorrentLink; qbtStatus?: TorrentStatus; movieMeta?: MovieMeta }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleCopy = async () => {
    if (!t.magnet) return;
    try {
      await navigator.clipboard.writeText(t.magnet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = t.magnet;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!t.magnet || downloading === "loading") return;
    setDownloading("loading");
    try {
      const res = await fetch("/api/torrents/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          magnet: t.magnet,
          ...(movieMeta ?? {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[qBittorrent]", data.error || res.statusText);
        setDownloading("error");
      } else {
        setDownloading("done");
      }
      setTimeout(() => setDownloading("idle"), 3000);
    } catch (err) {
      console.error("[qBittorrent]", err);
      setDownloading("error");
      setTimeout(() => setDownloading("idle"), 3000);
    }
  };

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ${
      qbtStatus
        ? qbtStatus.status === "completed"
          ? "bg-emerald-950/30 ring-emerald-800/50"
          : "bg-blue-950/30 ring-blue-800/50"
        : "bg-zinc-800/60 ring-zinc-700/50"
    }`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-200">{t.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-zinc-400">{t.provider}</span>
          {t.size && <span>{t.size}</span>}
          <span className="text-emerald-400">▲ {t.seeds}</span>
          <span className="text-red-400">▼ {t.peers}</span>
          {qbtStatus && (
            <TorrentInlineStatus status={qbtStatus} />
          )}
        </div>
      </div>
      {t.magnet && (
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Copy magnet button */}
          <button
            onClick={handleCopy}
            className={`rounded-lg p-2 transition ${
              copied
                ? "bg-blue-600/30 text-blue-300"
                : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
            title={copied ? "Copied!" : "Copy magnet link"}
          >
            {copied ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            )}
          </button>
          {/* Download to qBittorrent button */}
          <button
            onClick={handleDownload}
            disabled={downloading === "loading"}
            className={`rounded-lg p-2 transition ${
              downloading === "done"
                ? "bg-emerald-600/30 text-emerald-300"
                : downloading === "error"
                  ? "bg-red-600/30 text-red-300"
                  : downloading === "loading"
                    ? "bg-emerald-600/20 text-emerald-400 animate-pulse"
                    : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
            }`}
            title={
              downloading === "done"
                ? "Added to qBittorrent!"
                : downloading === "error"
                  ? "Failed to add"
                  : downloading === "loading"
                    ? "Sending..."
                    : "Download via qBittorrent"
            }
          >
            {downloading === "done" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : downloading === "error" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-zinc-300">{value}</dd>
    </div>
  );
}
