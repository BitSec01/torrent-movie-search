/** @jest-environment node */

import {
  chatModel,
  moviesDir,
  organizeModel,
  savePathFor,
  seriesDir,
  storageRoot,
  tmdbApiKey,
  torrentsDir,
  tpbBase,
} from "@/lib/config";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.STORAGE_ROOT;
    delete process.env.TPB_BASE;
    delete process.env.CHAT_MODEL;
    delete process.env.ORGANIZE_MODEL;
    delete process.env.TMDB_API_KEY;
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

  it("defaults the chat model to a tier that can name a film from a description", () => {
    expect(chatModel()).toBe("gpt-5.4-mini");
  });

  it("defaults the organiser to the same tier as the chat agent", () => {
    expect(organizeModel()).toBe("gpt-5.4-mini");
  });

  it("allows swapping either model without a rebuild", () => {
    process.env.CHAT_MODEL = "gpt-4o-mini";
    process.env.ORGANIZE_MODEL = "gpt-5.4";

    expect(chatModel()).toBe("gpt-4o-mini");
    expect(organizeModel()).toBe("gpt-5.4");
  });

  it("treats TMDB as unconfigured when the key is unset or blank", () => {
    expect(tmdbApiKey()).toBe("");

    process.env.TMDB_API_KEY = "  ";
    expect(tmdbApiKey()).toBe("");
  });

  it("trims a configured TMDB key so a stray space never breaks auth", () => {
    process.env.TMDB_API_KEY = "  abc123  ";
    expect(tmdbApiKey()).toBe("abc123");
  });

  it("sends movies to Movies and series to the torrents staging dir", () => {
    process.env.STORAGE_ROOT = "/srv/media";

    expect(savePathFor("movie")).toBe("/srv/media/Movies");
    expect(savePathFor("series")).toBe("/srv/media/torrents");
  });
});
