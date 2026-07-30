/** @jest-environment node */

// jest.mock factories are hoisted above imports, so require is the only option here
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@/db", () => {
  const Database = require("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const schema = require("@/db/schema");
  const { DOWNLOAD_TABLE_DDL } = require("../../helpers/test-db");

  const sqlite = new Database(":memory:");
  sqlite.exec(DOWNLOAD_TABLE_DDL);
  return { db: drizzle(sqlite, { schema }) };
});

jest.mock("@/lib/api/qbittorrent", () => ({ getTorrentsInfo: jest.fn().mockResolvedValue([]) }));

jest.mock("@/lib/api/metadata", () => ({ lookupTitleMetadata: jest.fn() }));
/* eslint-enable @typescript-eslint/no-require-imports */

import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { lookupTitleMetadata } from "@/lib/api/metadata";
import { MetadataSourceError } from "@/lib/api/errors";
import { syncDownloadStatuses, MAX_METADATA_ATTEMPTS, ENRICH_BATCH } from "@/lib/library/sync";

const lookupMock = lookupTitleMetadata as jest.MockedFunction<typeof lookupTitleMetadata>;

let seq = 0;

/** Seeded as "organized" so the orphan sweep, which sees no torrents, keeps the row. */
function seedUnenriched(): string {
  const id = `dl-${++seq}`;
  db.insert(download)
    .values({
      id,
      hash: `hash-${seq}`,
      magnet: `magnet:?xt=urn:btih:${seq}`,
      title: `Some Obscure Film ${seq}`,
      type: "movie",
      status: "organized",
      imdbId: null,
      poster: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return id;
}

beforeEach(() => {
  db.delete(download).run();
  lookupMock.mockReset();
});

describe("metadata enrichment budget", () => {
  it("gives up on a title no source can match instead of re-querying it every sweep", async () => {
    seedUnenriched();
    lookupMock.mockResolvedValue(null);

    for (let i = 0; i < MAX_METADATA_ATTEMPTS + 3; i++) {
      await syncDownloadStatuses();
    }

    expect(lookupMock).toHaveBeenCalledTimes(MAX_METADATA_ATTEMPTS);
  });

  it("abandons the batch on a key-level failure rather than repeating it per row", async () => {
    for (let i = 0; i < 5; i++) seedUnenriched();
    lookupMock.mockRejectedValue(new MetadataSourceError("Tmdb", "Invalid API key", "invalid-key"));

    await syncDownloadStatuses();

    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it("does not spend a row's attempts on a key-level failure", async () => {
    const id = seedUnenriched();
    lookupMock.mockRejectedValue(
      new MetadataSourceError("Tmdb", "Request limit reached", "rate-limited")
    );

    await syncDownloadStatuses();

    const row = db.select().from(download).where(eq(download.id, id)).get();
    expect(row?.metadataAttempts).toBe(0);
  });

  it("caps how many rows a single sweep looks up", async () => {
    for (let i = 0; i < ENRICH_BATCH + 5; i++) seedUnenriched();
    lookupMock.mockResolvedValue(null);

    await syncDownloadStatuses();

    expect(lookupMock).toHaveBeenCalledTimes(ENRICH_BATCH);
  });

  it("still enriches a row a source can resolve", async () => {
    const id = seedUnenriched();
    lookupMock.mockResolvedValue({
      imdbId: "tt1877830",
      poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
      year: "2022",
    });

    const result = await syncDownloadStatuses();

    expect(result.enriched).toBe(1);
    const row = db.select().from(download).where(eq(download.id, id)).get();
    expect(row?.imdbId).toBe("tt1877830");
    expect(row?.poster).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
  });
});
