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
/* eslint-enable @typescript-eslint/no-require-imports */

jest.mock("@/lib/library/sync", () => ({
  syncDownloadStatuses: jest.fn().mockResolvedValue({ checked: 0, updated: 0, removed: 0, enriched: 0 }),
}));
jest.mock("@/lib/library/plan", () => ({ planFolder: jest.fn() }));
jest.mock("@/lib/library/execute", () => ({ executePlans: jest.fn() }));

import { db } from "@/db";
import { download } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MAX_ORGANIZE_ATTEMPTS, runAutoOrganize } from "@/lib/library/auto-organize";
import { planFolder } from "@/lib/library/plan";
import { executePlans } from "@/lib/library/execute";
import { syncDownloadStatuses } from "@/lib/library/sync";

const planFolderMock = planFolder as jest.MockedFunction<typeof planFolder>;
const executePlansMock = executePlans as jest.MockedFunction<typeof executePlans>;

let seq = 0;

function seed(overrides: Partial<typeof download.$inferInsert> = {}): string {
  const id = `dl-${++seq}`;
  db.insert(download)
    .values({
      id,
      hash: `hash-${seq}`,
      magnet: `magnet:?xt=urn:btih:${seq}`,
      title: "Inception",
      year: "2010",
      type: "movie",
      torrentName: "Inception.2010.1080p",
      originalPath: "/mnt/storage/torrents/Inception.2010.1080p",
      status: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    })
    .run();
  return id;
}

function statusOf(id: string) {
  return db.select().from(download).where(eq(download.id, id)).get()!;
}

function goodPlan(folderName = "Inception.2010.1080p") {
  return {
    folderName,
    destinationBase: "/mnt/storage/Movies",
    rootFolder: "Inception (2010)",
    operations: [{ sourceAbsPath: "/a/b.mkv", destRelPath: "Inception (2010).mkv" }],
  };
}

function successOutcome() {
  return [{ folderName: "Inception.2010.1080p", destination: "/mnt/storage/Movies/Inception (2010)", copied: 1, failed: 0 }];
}

beforeEach(() => {
  db.delete(download).run();
  jest.clearAllMocks();
  planFolderMock.mockResolvedValue(goodPlan());
  executePlansMock.mockResolvedValue(successOutcome());
});

describe("runAutoOrganize", () => {
  it("organises a completed download without any user involvement", async () => {
    const id = seed();

    const result = await runAutoOrganize();

    expect(result).toMatchObject({ claimed: 1, organized: 1, failed: 0 });
    expect(executePlansMock).toHaveBeenCalledTimes(1);
    expect(statusOf(id)).toMatchObject({
      status: "organized",
      destinationPath: "/mnt/storage/Movies/Inception (2010)",
    });
  });

  it("clears a stale error message when a retry succeeds", async () => {
    const id = seed({ status: "failed", organizeAttempts: 1, errorMessage: "previously bad" });

    await runAutoOrganize();

    expect(statusOf(id).errorMessage).toBeNull();
  });

  it("reconciles with qBittorrent before deciding what is complete", async () => {
    await runAutoOrganize();

    expect(syncDownloadStatuses).toHaveBeenCalled();
  });

  it("leaves downloads that are still downloading alone", async () => {
    seed({ status: "downloading" });

    const result = await runAutoOrganize();

    expect(result.claimed).toBe(0);
    expect(planFolderMock).not.toHaveBeenCalled();
  });

  it("does not touch downloads already organized", async () => {
    seed({ status: "organized" });

    expect((await runAutoOrganize()).claimed).toBe(0);
  });

  it("claims by moving the row to organizing, so a second sweep cannot take it", async () => {
    seed({ status: "organizing" });

    const result = await runAutoOrganize();

    expect(result.claimed).toBe(0);
    expect(planFolderMock).not.toHaveBeenCalled();
  });

  it("marks the download failed when planning fails", async () => {
    const id = seed();
    planFolderMock.mockResolvedValue({ folderName: "x", error: "Source folder not found" });

    const result = await runAutoOrganize();

    expect(result).toMatchObject({ organized: 0, failed: 1 });
    expect(statusOf(id)).toMatchObject({ status: "failed", errorMessage: "Source folder not found" });
    expect(executePlansMock).not.toHaveBeenCalled();
  });

  it("does not execute a plan that would copy nothing", async () => {
    const id = seed();
    planFolderMock.mockResolvedValue({ ...goodPlan(), operations: [] });

    await runAutoOrganize();

    expect(executePlansMock).not.toHaveBeenCalled();
    expect(statusOf(id).status).toBe("failed");
  });

  it("marks the download failed when execution reports an error", async () => {
    const id = seed();
    executePlansMock.mockResolvedValue([
      { folderName: "x", copied: 0, failed: 1, error: "Insufficient space" },
    ]);

    await runAutoOrganize();

    expect(statusOf(id)).toMatchObject({ status: "failed", errorMessage: "Insufficient space" });
  });

  it("marks the download failed when execution copies nothing", async () => {
    const id = seed();
    executePlansMock.mockResolvedValue([{ folderName: "x", copied: 0, failed: 2 }]);

    await runAutoOrganize();

    expect(statusOf(id).status).toBe("failed");
  });

  it("survives an exception mid-sweep and records it against the download", async () => {
    const id = seed();
    executePlansMock.mockRejectedValue(new Error("disk exploded"));

    const result = await runAutoOrganize();

    expect(result.failed).toBe(1);
    expect(statusOf(id)).toMatchObject({ status: "failed", errorMessage: "disk exploded" });
  });

  it("keeps going after one download fails", async () => {
    seed({ hash: "a" });
    seed({ hash: "b" });
    planFolderMock
      .mockResolvedValueOnce({ folderName: "x", error: "bad" })
      .mockResolvedValueOnce(goodPlan());

    const result = await runAutoOrganize();

    expect(result).toMatchObject({ claimed: 2, organized: 1, failed: 1 });
  });

  it("plans from the torrent name on disk rather than the library title", async () => {
    seed({ title: "Inception", torrentName: "www.site.com - Inception.2010.BluRay" });

    await runAutoOrganize();

    expect(planFolderMock).toHaveBeenCalledWith(
      expect.objectContaining({ folderName: "www.site.com - Inception.2010.BluRay" })
    );
  });

  it("falls back to the original path when no torrent name was recorded", async () => {
    seed({ torrentName: null, originalPath: "/mnt/storage/torrents/Some.Release.2024" });

    await runAutoOrganize();

    expect(planFolderMock).toHaveBeenCalledWith(
      expect.objectContaining({ folderName: "Some.Release.2024" })
    );
  });

  it("skips a download with nothing on disk to plan from", async () => {
    seed({ torrentName: null, originalPath: null });

    const result = await runAutoOrganize();

    expect(result).toMatchObject({ claimed: 0, skipped: 1 });
  });
});

describe("retry policy", () => {
  it("retries a previously failed download", async () => {
    const id = seed({ status: "failed", organizeAttempts: 1 });

    const result = await runAutoOrganize();

    expect(result).toMatchObject({ claimed: 1, organized: 1 });
    expect(statusOf(id).organizeAttempts).toBe(2);
  });

  it("stops retrying once attempts are exhausted", async () => {
    seed({ status: "failed", organizeAttempts: MAX_ORGANIZE_ATTEMPTS });

    const result = await runAutoOrganize();

    expect(result).toMatchObject({ claimed: 0, skipped: 1 });
    expect(planFolderMock).not.toHaveBeenCalled();
  });

  it("gives up after exactly one retry", async () => {
    const id = seed();
    planFolderMock.mockResolvedValue({ folderName: "x", error: "bad plan" });

    await runAutoOrganize();
    expect(statusOf(id).organizeAttempts).toBe(1);

    await runAutoOrganize();
    expect(statusOf(id).organizeAttempts).toBe(MAX_ORGANIZE_ATTEMPTS);

    planFolderMock.mockClear();
    const third = await runAutoOrganize();

    expect(third.claimed).toBe(0);
    expect(planFolderMock).not.toHaveBeenCalled();
  });
});
