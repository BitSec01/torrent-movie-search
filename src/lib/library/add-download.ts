import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { download } from "@/db/schema";
import { addTorrent, extractHash } from "@/lib/api/qbittorrent";
import { cleanTitle } from "./title";

export interface AddDownloadInput {
  magnet: string;
  title?: string;
  year?: string;
  type?: string;
  imdbId?: string;
  poster?: string;
  totalSeasons?: string;
}

export interface AddDownloadResult {
  success: boolean;
  message: string;
}

/**
 * Queue a torrent and record it in the library.
 *
 * Shared by the HTTP route and the chat agent's downloadTorrent tool. The tool
 * used to reach this by fetching the app's own public URL, which the container
 * cannot resolve — and going through the network to reach code in the same
 * process bought nothing but that failure.
 */
export async function addDownload(input: AddDownloadInput): Promise<AddDownloadResult> {
  const result = await addTorrent(input.magnet);
  if (!result.success) return result;

  const hash = extractHash(input.magnet);
  if (!hash || !input.title) return result;

  const existing = db.select().from(download).where(eq(download.hash, hash)).get();
  if (existing) return result;

  // The caller's title is often the release name it picked the torrent by. Kept
  // raw it becomes the library card's label, the query metadata enrichment
  // fails on, and the hint the organiser names the destination folder after.
  const now = new Date();
  db.insert(download)
    .values({
      id: randomUUID(),
      hash,
      magnet: input.magnet,
      title: cleanTitle(input.title) || input.title,
      year: input.year || null,
      type: input.type || "movie",
      imdbId: input.imdbId || null,
      poster: input.poster || null,
      totalSeasons: input.totalSeasons || null,
      status: "downloading",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return result;
}
