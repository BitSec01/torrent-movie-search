/** @jest-environment node */

// Real filesystem test: the point of merge mode is that files survive, which a
// mocked fs would not actually prove.
jest.mock("@/db", () => ({ db: {} }));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FolderPlan } from "@/lib/library/types";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "organise-"));
process.env.STORAGE_ROOT = ROOT;

const SERIES = path.join(ROOT, "Series");
const TORRENTS = path.join(ROOT, "torrents");

type ExecutePlans = typeof import("@/lib/library/execute").executePlans;
let executePlans: ExecutePlans;

beforeAll(async () => {
  // Imported after STORAGE_ROOT is set, since the module reads config on load
  ({ executePlans } = await import("@/lib/library/execute"));
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(SERIES, { recursive: true, force: true });
  fs.rmSync(TORRENTS, { recursive: true, force: true });
  fs.mkdirSync(SERIES, { recursive: true });
  fs.mkdirSync(TORRENTS, { recursive: true });
});

function sourceFile(name: string, contents = "video"): string {
  const dir = path.join(TORRENTS, "Suits.S02.1080p");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function existingSeason(season: string, file: string, contents = "already here") {
  const dir = path.join(SERIES, "Suits (2011)", season);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), contents);
}

function plan(sourceAbsPath: string, destRelPath: string): FolderPlan {
  return {
    folderName: "Suits.S02.1080p",
    destinationBase: SERIES,
    rootFolder: "Suits (2011)",
    operations: [{ sourceAbsPath, destRelPath }],
  };
}

function read(rel: string): string | null {
  const p = path.join(SERIES, "Suits (2011)", rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

describe("merge mode", () => {
  it("keeps a previously filed season when a new one is added", async () => {
    existingSeason("Season 01", "Suits (2011) - s01e01.mkv");
    const src = sourceFile("s02e01.mkv");

    await executePlans([plan(src, "Season 02/Suits (2011) - s02e01.mkv")], () => {}, {
      mode: "merge",
    });

    expect(read("Season 01/Suits (2011) - s01e01.mkv")).toBe("already here");
    expect(read("Season 02/Suits (2011) - s02e01.mkv")).toBe("video");
  });

  it("keeps sibling episodes within the same season", async () => {
    existingSeason("Season 02", "Suits (2011) - s02e01.mkv", "episode one");
    const src = sourceFile("s02e02.mkv", "episode two");

    await executePlans([plan(src, "Season 02/Suits (2011) - s02e02.mkv")], () => {}, {
      mode: "merge",
    });

    expect(read("Season 02/Suits (2011) - s02e01.mkv")).toBe("episode one");
    expect(read("Season 02/Suits (2011) - s02e02.mkv")).toBe("episode two");
  });

  it("overwrites the same episode when it is re-downloaded", async () => {
    existingSeason("Season 02", "Suits (2011) - s02e01.mkv", "old rip");
    const src = sourceFile("s02e01.mkv", "better rip");

    await executePlans([plan(src, "Season 02/Suits (2011) - s02e01.mkv")], () => {}, {
      mode: "merge",
    });

    expect(read("Season 02/Suits (2011) - s02e01.mkv")).toBe("better rip");
  });

  it("reports the merge and the file it replaced", async () => {
    existingSeason("Season 02", "Suits (2011) - s02e01.mkv", "old rip");
    const src = sourceFile("s02e01.mkv", "better rip");
    const events: Array<{ action: unknown; detail: unknown }> = [];

    await executePlans(
      [plan(src, "Season 02/Suits (2011) - s02e01.mkv")],
      (event, data) => {
        if (event === "log") events.push({ action: data.action, detail: data.detail });
      },
      { mode: "merge" }
    );

    expect(events.map((e) => e.action)).toContain("MERGE");
    expect(events.map((e) => e.action)).toContain("REPLACE");
    expect(events.map((e) => e.action)).not.toContain("OVERWRITE");
  });

  it("still creates the folder when nothing is there yet", async () => {
    const src = sourceFile("s02e01.mkv");

    const [outcome] = await executePlans(
      [plan(src, "Season 02/Suits (2011) - s02e01.mkv")],
      () => {},
      { mode: "merge" }
    );

    expect(outcome.copied).toBe(1);
    expect(read("Season 02/Suits (2011) - s02e01.mkv")).toBe("video");
  });

  it("leaves the source torrent in place so seeding continues", async () => {
    const src = sourceFile("s02e01.mkv");

    await executePlans([plan(src, "Season 02/Suits (2011) - s02e01.mkv")], () => {}, {
      mode: "merge",
    });

    expect(fs.existsSync(src)).toBe(true);
  });
});

describe("replace mode", () => {
  it("wipes the destination, which is why the sweep must not use it", async () => {
    existingSeason("Season 01", "Suits (2011) - s01e01.mkv");
    const src = sourceFile("s02e01.mkv");

    await executePlans([plan(src, "Season 02/Suits (2011) - s02e01.mkv")], () => {}, {
      mode: "replace",
    });

    expect(read("Season 01/Suits (2011) - s01e01.mkv")).toBeNull();
    expect(read("Season 02/Suits (2011) - s02e01.mkv")).toBe("video");
  });

  it("is never what a caller gets by omitting the option", async () => {
    existingSeason("Season 01", "Suits (2011) - s01e01.mkv");
    const src = sourceFile("s02e01.mkv");

    await executePlans([plan(src, "Season 02/Suits (2011) - s02e01.mkv")]);

    expect(read("Season 01/Suits (2011) - s01e01.mkv")).toBe("already here");
  });
});

describe("per-plan mode", () => {
  it("lets one folder replace while another merges in the same run", async () => {
    existingSeason("Season 01", "Suits (2011) - s01e01.mkv");
    const src = sourceFile("s02e01.mkv");

    const merging = { ...plan(src, "Season 02/Suits (2011) - s02e01.mkv"), mode: "merge" as const };
    await executePlans([merging], () => {}, { mode: "replace" });

    expect(read("Season 01/Suits (2011) - s01e01.mkv")).toBe("already here");
  });

  it("honours an explicit replace even when the batch default is merge", async () => {
    existingSeason("Season 01", "Suits (2011) - s01e01.mkv");
    const src = sourceFile("s02e01.mkv");

    const replacing = {
      ...plan(src, "Season 02/Suits (2011) - s02e01.mkv"),
      mode: "replace" as const,
    };
    await executePlans([replacing], () => {}, { mode: "merge" });

    expect(read("Season 01/Suits (2011) - s01e01.mkv")).toBeNull();
  });
});

describe("path safety", () => {
  it("refuses a destination outside the media roots", async () => {
    const src = sourceFile("s02e01.mkv");
    const escaping: FolderPlan = {
      ...plan(src, "x.mkv"),
      destinationBase: path.join(ROOT, "torrents"),
    };

    const [outcome] = await executePlans([escaping], () => {}, { mode: "merge" });

    expect(outcome.error).toMatch(/outside allowed directories/i);
    expect(outcome.copied).toBe(0);
  });
});
