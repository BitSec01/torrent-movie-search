/** @jest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "dest-"));
process.env.STORAGE_ROOT = ROOT;

const SERIES = path.join(ROOT, "Series");

type Inspect = typeof import("@/lib/library/destination").inspectDestination;
let inspectDestination: Inspect;

beforeAll(async () => {
  ({ inspectDestination } = await import("@/lib/library/destination"));
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(SERIES, { recursive: true, force: true });
  fs.mkdirSync(SERIES, { recursive: true });
});

function makeShow(seasons: Record<string, string[]>) {
  for (const [season, files] of Object.entries(seasons)) {
    const dir = path.join(SERIES, "Suits (2011)", season);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), "x");
  }
}

describe("inspectDestination", () => {
  it("reports nothing when the destination has never been created", async () => {
    const info = await inspectDestination(SERIES, "Suits (2011)");

    expect(info).toEqual({ exists: false, entries: [], fileCount: 0 });
  });

  it("lists what is already filed so the user can judge the risk", async () => {
    makeShow({ "Season 01": ["s01e01.mkv", "s01e02.mkv"], "Season 02": ["s02e01.mkv"] });

    const info = await inspectDestination(SERIES, "Suits (2011)");

    expect(info.exists).toBe(true);
    expect(info.entries.sort()).toEqual(["Season 01", "Season 02"]);
    expect(info.fileCount).toBe(3);
  });

  it("treats an empty leftover folder as nothing worth warning about", async () => {
    fs.mkdirSync(path.join(SERIES, "Suits (2011)"), { recursive: true });

    expect((await inspectDestination(SERIES, "Suits (2011)")).exists).toBe(false);
  });

  it("refuses to look outside the media roots", async () => {
    fs.mkdirSync(path.join(ROOT, "torrents", "secret"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "torrents", "secret", "f.mkv"), "x");

    const info = await inspectDestination(path.join(ROOT, "torrents"), "secret");

    expect(info.exists).toBe(false);
  });

  it("refuses a traversal attempt", async () => {
    const info = await inspectDestination(SERIES, "../../etc");

    expect(info.exists).toBe(false);
  });

  it("reports nothing when the root folder is still blank", async () => {
    expect((await inspectDestination(SERIES, "")).exists).toBe(false);
  });

  it("handles names with quotes and spaces", async () => {
    const dir = path.join(SERIES, "Bob's Burgers (2011)", "Season 01");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "s01e01.mkv"), "x");

    const info = await inspectDestination(SERIES, "Bob's Burgers (2011)");

    expect(info.exists).toBe(true);
    expect(info.fileCount).toBe(1);
  });
});
