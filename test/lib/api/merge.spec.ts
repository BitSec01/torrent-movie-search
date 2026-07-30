/** @jest-environment node */

import { mergeSearchResults, mergeDetail } from "@/lib/api/merge";
import type {
  OmdbSearchItem,
  TmdbSearchItem,
  TmdbDetail,
  OmdbDetailResponse,
} from "@/lib/api/types";

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

function omdbHit(over: Partial<OmdbSearchItem> = {}): OmdbSearchItem {
  return {
    Title: "The Batman",
    Year: "2022",
    imdbID: "tt1877830",
    Type: "movie",
    Poster: "https://m.media-amazon.com/omdb.jpg",
    ...over,
  };
}

describe("mergeSearchResults", () => {
  it("returns TMDB results when no other source answered", () => {
    const merged = mergeSearchResults([tmdbHit()]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      imdbId: "tt1877830",
      title: "The Batman",
      poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
    });
  });

  it("keeps the TMDB poster rather than the OMDb one for the same title", () => {
    const merged = mergeSearchResults([tmdbHit()], [omdbHit()]);

    expect(merged).toHaveLength(1);
    expect(merged[0].poster).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
  });

  it("backfills a poster TMDB did not have from OMDb", () => {
    const merged = mergeSearchResults([tmdbHit({ poster: null })], [omdbHit()]);

    expect(merged[0].poster).toBe("https://m.media-amazon.com/omdb.jpg");
  });

  it("treats an OMDb \"N/A\" poster as absent", () => {
    const merged = mergeSearchResults([tmdbHit({ poster: null })], [omdbHit({ Poster: "N/A" })]);

    expect(merged[0].poster).toBeNull();
  });

  it("adds an OMDb-only title that TMDB missed", () => {
    const merged = mergeSearchResults(
      [tmdbHit()],
      [omdbHit({ imdbID: "tt0111161", Title: "The Shawshank Redemption", Year: "1994" })]
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.imdbId)).toContain("tt0111161");
  });

  it("keys a TMDB series result as a series", () => {
    const merged = mergeSearchResults([tmdbHit({ imdbId: "tt0903747", type: "series" })]);

    expect(merged[0].type).toBe("series");
  });

  it("normalizes OMDb's tvSeries type to series", () => {
    const merged = mergeSearchResults([], [omdbHit({ Type: "tvSeries" })]);

    expect(merged[0].type).toBe("series");
  });

  it("drops entries with no title", () => {
    const merged = mergeSearchResults([tmdbHit({ title: "" })]);

    expect(merged).toHaveLength(0);
  });
});

describe("mergeDetail", () => {
  const tmdb: TmdbDetail = {
    imdbId: "tt1877830",
    title: "The Batman",
    year: "2022",
    type: "movie",
    poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
    plot: "A TMDB plot.",
    rating: "7.8",
    runtime: "176 min",
    genres: ["Crime", "Mystery"],
    director: "Matt Reeves",
    actors: "Robert Pattinson",
    rated: "M",
    released: "01 Mar 2022",
  };

  it("renders a complete detail from TMDB alone", () => {
    const detail = mergeDetail(tmdb);

    expect(detail).toMatchObject({
      imdbId: "tt1877830",
      title: "The Batman",
      poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
      plot: "A TMDB plot.",
      runtime: "176 min",
      genres: ["Crime", "Mystery"],
      director: "Matt Reeves",
      rated: "M",
    });
  });

  it("returns null when every source is absent", () => {
    expect(mergeDetail(null, null)).toBeNull();
  });

  it("still returns a detail when only OMDb answered", () => {
    const omdb = {
      Title: "The Batman",
      Year: "2022",
      Plot: "An OMDb plot.",
      Poster: "https://m.media-amazon.com/omdb.jpg",
    } as OmdbDetailResponse;

    expect(mergeDetail(null, omdb)).toMatchObject({
      title: "The Batman",
      plot: "An OMDb plot.",
      poster: "https://m.media-amazon.com/omdb.jpg",
    });
  });

  it("prefers TMDB over OMDb for fields both carry", () => {
    const omdb = {
      Plot: "An OMDb plot.",
      Poster: "https://m.media-amazon.com/omdb.jpg",
      Runtime: "999 min",
    } as OmdbDetailResponse;

    const detail = mergeDetail(tmdb, omdb);
    expect(detail?.plot).toBe("A TMDB plot.");
    expect(detail?.poster).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
    expect(detail?.runtime).toBe("176 min");
  });

  it("fills a field TMDB lacks from OMDb", () => {
    const omdb = { Writer: "Peter Craig" } as OmdbDetailResponse;

    expect(mergeDetail(tmdb, omdb)?.writer).toBe("Peter Craig");
  });

  it("ignores OMDb \"N/A\" values instead of showing them", () => {
    const omdb = { Awards: "N/A", Writer: "N/A" } as OmdbDetailResponse;
    const detail = mergeDetail(tmdb, omdb);

    expect(detail?.awards).toBeUndefined();
    expect(detail?.writer).toBeUndefined();
  });

  it("adds TMDB as a distinct rating source", () => {
    expect(mergeDetail(tmdb)?.ratings).toContainEqual({ source: "TMDB", value: "7.8/10" });
  });

  it("keeps the OMDb-only rating sources alongside the TMDB score", () => {
    const omdb = {
      Ratings: [{ Source: "Rotten Tomatoes", Value: "85%" }],
    } as OmdbDetailResponse;

    const detail = mergeDetail(tmdb, omdb);
    expect(detail?.ratings).toEqual([
      { source: "Rotten Tomatoes", value: "85%" },
      { source: "TMDB", value: "7.8/10" },
    ]);
  });

  it("does not duplicate a TMDB rating that OMDb already carries", () => {
    const omdb = {
      Ratings: [{ Source: "TMDB", Value: "9.0/10" }],
    } as OmdbDetailResponse;

    const tmdbRatings = mergeDetail(tmdb, omdb)?.ratings.filter((r) => r.source === "TMDB") ?? [];
    expect(tmdbRatings).toHaveLength(1);
  });

  it("takes the IMDb rating only from OMDb, since TMDB has no equivalent", () => {
    expect(mergeDetail(tmdb)?.imdbRating).toBeUndefined();

    const omdb = { imdbRating: "7.8", imdbVotes: "800,000" } as OmdbDetailResponse;
    expect(mergeDetail(tmdb, omdb)).toMatchObject({
      imdbRating: "7.8",
      imdbVotes: "800,000",
    });
  });

  it("falls back to OMDb genres when TMDB returned none", () => {
    const omdb = { Genre: "Action, Thriller" } as OmdbDetailResponse;

    expect(mergeDetail({ ...tmdb, genres: [] }, omdb)?.genres).toEqual(["Action", "Thriller"]);
  });
});
