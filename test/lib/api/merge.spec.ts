/** @jest-environment node */

import { mergeSearchResults, mergeDetail } from "@/lib/api/merge";
import type {
  ImdbSearchResult,
  OmdbSearchItem,
  TmdbSearchItem,
  TmdbDetail,
  OmdbDetailResponse,
} from "@/lib/api/types";

function imdbHit(over: Partial<ImdbSearchResult> = {}): ImdbSearchResult {
  return {
    "#TITLE": "The Batman",
    "#YEAR": 2022,
    "#IMDB_ID": "tt1877830",
    "#RANK": 1,
    ...over,
  };
}

function tmdbHit(over: Partial<TmdbSearchItem> = {}): TmdbSearchItem {
  return {
    imdbId: "tt1877830",
    title: "The Batman",
    year: "2022",
    type: "movie",
    poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
    ...over,
  };
}

describe("mergeSearchResults with TMDB", () => {
  it("backfills a missing poster on an existing IMDb result from TMDB", () => {
    const imdb = [imdbHit({ "#IMG_POSTER": undefined })];
    const merged = mergeSearchResults(imdb, [], [tmdbHit()]);

    expect(merged).toHaveLength(1);
    expect(merged[0].poster).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
  });

  it("does not overwrite a poster that another source already provided", () => {
    const imdb = [imdbHit({ "#IMG_POSTER": "https://m.media-amazon.com/keep.jpg" })];
    const merged = mergeSearchResults(imdb, [], [tmdbHit()]);

    expect(merged[0].poster).toBe("https://m.media-amazon.com/keep.jpg");
  });

  it("adds a TMDB-only title when no other source returned it", () => {
    const merged = mergeSearchResults([], [], [
      tmdbHit({ imdbId: "tt0111161", title: "The Shawshank Redemption", year: "1994" }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      imdbId: "tt0111161",
      title: "The Shawshank Redemption",
      type: "movie",
    });
  });

  it("keys a TMDB series result as a series", () => {
    const merged = mergeSearchResults([], [], [
      tmdbHit({ imdbId: "tt0903747", title: "Breaking Bad", type: "series" }),
    ]);

    expect(merged[0].type).toBe("series");
  });

  it("merges the same title across all three sources into one entry", () => {
    const imdb = [imdbHit({ "#IMG_POSTER": undefined })];
    const omdb: OmdbSearchItem[] = [
      { Title: "The Batman", Year: "2022", imdbID: "tt1877830", Type: "movie", Poster: "N/A" },
    ];
    const merged = mergeSearchResults(imdb, omdb, [tmdbHit()]);

    expect(merged).toHaveLength(1);
    expect(merged[0].poster).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
  });

  it("is unchanged when no TMDB results are passed", () => {
    const merged = mergeSearchResults([imdbHit()], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].imdbId).toBe("tt1877830");
  });
});

describe("mergeDetail with TMDB", () => {
  const tmdb: TmdbDetail = {
    imdbId: "tt1877830",
    title: "The Batman",
    year: "2022",
    type: "movie",
    poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
    plot: "A TMDB plot.",
    rating: "7.8",
  };

  it("returns a detail from TMDB alone when the other sources are down", () => {
    const detail = mergeDetail(null, null, tmdb);

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      imdbId: "tt1877830",
      title: "The Batman",
      poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
      plot: "A TMDB plot.",
    });
  });

  it("still returns null when every source is absent", () => {
    expect(mergeDetail(null, null, null)).toBeNull();
  });

  it("prefers an OMDb poster over the TMDB one, but falls back to TMDB", () => {
    const omdb = { Poster: "https://m.media-amazon.com/omdb.jpg" } as OmdbDetailResponse;
    expect(mergeDetail(null, omdb, tmdb)?.poster).toBe("https://m.media-amazon.com/omdb.jpg");

    const omdbNoPoster = { Poster: "N/A" } as OmdbDetailResponse;
    expect(mergeDetail(null, omdbNoPoster, tmdb)?.poster).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg"
    );
  });

  it("adds TMDB as a distinct rating source", () => {
    const detail = mergeDetail(null, null, tmdb);
    expect(detail?.ratings).toContainEqual({ source: "TMDB", value: "7.8/10" });
  });

  it("does not duplicate a TMDB rating that OMDb already carries", () => {
    const omdb = {
      Ratings: [{ Source: "TMDB", Value: "9.0/10" }],
    } as OmdbDetailResponse;
    const detail = mergeDetail(null, omdb, tmdb);
    const tmdbRatings = detail?.ratings.filter((r) => r.source === "TMDB") ?? [];
    expect(tmdbRatings).toHaveLength(1);
  });
});
