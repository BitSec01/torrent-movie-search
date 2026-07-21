/** @jest-environment node */

import { clearMagnetRegistry, rememberMagnet, resolveMagnet } from "@/lib/api/magnet-registry";

const HASH = "0499677faa60486f22a2c288fa7e168318fbf8b7";
const TRACKERS = "&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fopen.demonii.com%3A1337";
const FULL_MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Some.Movie.1080p${TRACKERS}`;

describe("magnet registry", () => {
  beforeEach(() => {
    clearMagnetRegistry();
  });

  it("returns the info hash as the reference for a magnet", () => {
    expect(rememberMagnet(FULL_MAGNET)).toBe(HASH);
  });

  it("round-trips a magnet with its tracker list intact", () => {
    const id = rememberMagnet(FULL_MAGNET)!;

    expect(resolveMagnet(id)).toBe(FULL_MAGNET);
  });

  it("gives the model a reference far smaller than the magnet it replaces", () => {
    const id = rememberMagnet(FULL_MAGNET)!;

    expect(id.length).toBeLessThan(FULL_MAGNET.length / 2);
  });

  it("normalises uppercase hashes so the model can echo either casing", () => {
    rememberMagnet(FULL_MAGNET);

    expect(resolveMagnet(HASH.toUpperCase())).toBe(FULL_MAGNET);
  });

  it("accepts a full magnet as the reference, not just a bare hash", () => {
    rememberMagnet(FULL_MAGNET);

    expect(resolveMagnet(`magnet:?xt=urn:btih:${HASH}`)).toBe(FULL_MAGNET);
  });

  it("keeps the most recent magnet when the same hash is stored twice", () => {
    rememberMagnet(FULL_MAGNET);
    const updated = `magnet:?xt=urn:btih:${HASH}&dn=Better.Source`;
    rememberMagnet(updated);

    expect(resolveMagnet(HASH)).toBe(updated);
  });

  it("rejects a magnet that carries no info hash", () => {
    expect(rememberMagnet("magnet:?dn=nothing-useful")).toBeNull();
  });

  it("rejects a reference that is neither a hash nor a magnet", () => {
    expect(resolveMagnet("not-a-torrent")).toBeNull();
  });

  it("rebuilds a usable magnet when the entry is gone after a restart", () => {
    const resolved = resolveMagnet(HASH, "Some Movie");

    expect(resolved).toBe(`magnet:?xt=urn:btih:${HASH}&dn=Some%20Movie`);
  });

  it("rebuilds without a display name when none is known", () => {
    expect(resolveMagnet(HASH)).toBe(`magnet:?xt=urn:btih:${HASH}`);
  });

  it("expires entries and falls back rather than returning a stale magnet", () => {
    jest.useFakeTimers();
    try {
      rememberMagnet(FULL_MAGNET);
      jest.advanceTimersByTime(7 * 60 * 60 * 1000);

      expect(resolveMagnet(HASH)).toBe(`magnet:?xt=urn:btih:${HASH}`);
    } finally {
      jest.useRealTimers();
    }
  });

  it("supports 32-char base32 hashes", () => {
    const base32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const magnet = `magnet:?xt=urn:btih:${base32}&dn=Old.Style`;

    const id = rememberMagnet(magnet)!;
    expect(resolveMagnet(id)).toBe(magnet);
  });
});
