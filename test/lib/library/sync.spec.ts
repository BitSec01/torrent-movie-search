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

// OmdbError stays real: sync discriminates on `instanceof`, so a stubbed class
// would make the key-failure path untestable.
jest.mock("@/lib/api/omdb", () => ({
  ...jest.requireActual("@/lib/api/omdb"),
  searchOmdb: jest.fn(),
}));
/* eslint-enable @typescript-eslint/no-require-imports */

import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { searchOmdb, OmdbError } from "@/lib/api/omdb";
import { syncDownloadStatuses, MAX_METADATA_ATTEMPTS, ENRICH_BATCH } from "@/lib/library/sync";

const searchOmdbMock = searchOmdb as jest.MockedFunction<typeof searchOmdb>;

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
  searchOmdbMock.mockReset();
});

describe("metadata enrichment budget", () => {
  it("gives up on a title OMDb has no match for instead of re-querying it every sweep", async () => {
    seedUnenriched();
    searchOmdbMock.mockResolvedValue({ Response: "False", Error: "Movie not found!" });

    for (let i = 0; i < MAX_METADATA_ATTEMPTS + 3; i++) {
      await syncDownloadStatuses();
    }

    expect(searchOmdbMock).toHaveBeenCalledTimes(MAX_METADATA_ATTEMPTS);
  });

  it("abandons the batch on a key-level failure rather than repeating it per row", async () => {
    for (let i = 0; i < 5; i++) seedUnenriched();
    searchOmdbMock.mockRejectedValue(new OmdbError("Invalid API key!", "invalid-key"));

    await syncDownloadStatuses();

    expect(searchOmdbMock).toHaveBeenCalledTimes(1);
  });

  it("does not spend a row's attempts on a key-level failure", async () => {
    const id = seedUnenriched();
    searchOmdbMock.mockRejectedValue(new OmdbError("Request limit reached!", "rate-limited"));

    await syncDownloadStatuses();

    const row = db.select().from(download).where(eq(download.id, id)).get();
    expect(row?.metadataAttempts).toBe(0);
  });

  it("caps how many rows a single sweep looks up", async () => {
    for (let i = 0; i < ENRICH_BATCH + 5; i++) seedUnenriched();
    searchOmdbMock.mockResolvedValue({ Response: "False", Error: "Movie not found!" });

    await syncDownloadStatuses();

    expect(searchOmdbMock).toHaveBeenCalledTimes(ENRICH_BATCH);
  });

  it("still enriches a row OMDb can resolve", async () => {
    const id = seedUnenriched();
    searchOmdbMock.mockResolvedValue({
      Response: "True",
      Search: [
        { Title: "The Batman", Year: "2022", imdbID: "tt1877830", Type: "movie", Poster: "https://poster" },
      ],
    });

    const result = await syncDownloadStatuses();

    expect(result.enriched).toBe(1);
    const row = db.select().from(download).where(eq(download.id, id)).get();
    expect(row?.imdbId).toBe("tt1877830");
    expect(row?.poster).toBe("https://poster");
  });
});
