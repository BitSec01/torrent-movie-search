"use client";

import { useState, useEffect, useCallback } from "react";

export interface TorrentStatus {
  hash: string;
  name: string;
  status: string; // queued | downloading | paused | completed | error | missing
  progress: number; // 0.0 – 1.0
  dlspeed: number;
  upspeed: number;
  seeds: number;
  peers: number;
  eta: number | null;
  size: number;
}

/** Map of lowercase hash → torrent status from qBittorrent */
export type TorrentStatusMap = Map<string, TorrentStatus>;

/** Extract the info hash (btih) from a magnet URI (client-side) */
export function extractHash(magnet: string): string | null {
  const match = magnet.match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Hook that polls GET /api/torrents/status to get all qBittorrent torrents.
 * Returns a Map<hash, TorrentStatus> for matching against magnet links.
 * Only polls while `enabled` is true (e.g. when the detail modal is open).
 */
export function useTorrentStatuses(enabled = false, intervalMs = 5000) {
  const [statusMap, setStatusMap] = useState<TorrentStatusMap>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/torrents/status");
      if (!res.ok) return;
      const data = await res.json();
      const torrents: TorrentStatus[] = data.torrents ?? [];

      const map = new Map<string, TorrentStatus>();
      for (const t of torrents) {
        map.set(t.hash.toLowerCase(), t);
      }
      setStatusMap(map);
    } catch {
      // Silently fail polling
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetchStatuses();

    // Poll interval
    const timer = setInterval(fetchStatuses, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, fetchStatuses]);

  return { statusMap, loading };
}
