/** @jest-environment node */

import { moviesDir, savePathFor, seriesDir, storageRoot, torrentsDir, tpbBase } from "@/lib/config";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.STORAGE_ROOT;
    delete process.env.TPB_BASE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("defaults the storage root when unset", () => {
    expect(storageRoot()).toBe("/mnt/storage");
    expect(moviesDir()).toBe("/mnt/storage/Movies");
    expect(seriesDir()).toBe("/mnt/storage/Series");
    expect(torrentsDir()).toBe("/mnt/storage/torrents");
  });

  it("derives every media dir from STORAGE_ROOT", () => {
    process.env.STORAGE_ROOT = "/srv/media";

    expect(moviesDir()).toBe("/srv/media/Movies");
    expect(seriesDir()).toBe("/srv/media/Series");
    expect(torrentsDir()).toBe("/srv/media/torrents");
  });

  it("reads env on each call rather than caching at import", () => {
    process.env.STORAGE_ROOT = "/first";
    expect(storageRoot()).toBe("/first");

    process.env.STORAGE_ROOT = "/second";
    expect(storageRoot()).toBe("/second");
  });

  it("strips trailing slashes so joined paths never double up", () => {
    process.env.STORAGE_ROOT = "/srv/media///";
    process.env.TPB_BASE = "https://example.test/";

    expect(moviesDir()).toBe("/srv/media/Movies");
    expect(tpbBase()).toBe("https://example.test");
  });

  it("falls back to the default when the env var is empty", () => {
    process.env.STORAGE_ROOT = "";

    expect(storageRoot()).toBe("/mnt/storage");
  });

  it("defaults the TPB mirror and allows overriding it", () => {
    expect(tpbBase()).toBe("https://www3.thepiratebay3.to");

    process.env.TPB_BASE = "https://mirror.test";
    expect(tpbBase()).toBe("https://mirror.test");
  });

  it("sends movies to Movies and series to the torrents staging dir", () => {
    process.env.STORAGE_ROOT = "/srv/media";

    expect(savePathFor("movie")).toBe("/srv/media/Movies");
    expect(savePathFor("series")).toBe("/srv/media/torrents");
  });
});
