/** @jest-environment node */

import { searchTmdb, getTmdbDetailByImdb, tmdbConfigured, TmdbError } from "@/lib/api/tmdb";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function fail(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

/** The URL of the nth fetch, as a parsed URL for assertions on query params. */
function requestedUrl(call: number): URL {
  return new URL(fetchMock.mock.calls[call][0] as string);
}

beforeEach(() => {
  fetchMock.mockReset();
  process.env.TMDB_API_KEY = "v3key";
});

describe("tmdbConfigured", () => {
  it("is false for an unset or blank key", () => {
    process.env.TMDB_API_KEY = "";
    expect(tmdbConfigured()).toBe(false);

    process.env.TMDB_API_KEY = "   ";
    expect(tmdbConfigured()).toBe(false);
  });
});

describe("credentials", () => {
  it("sends a v3 key as a query param", async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }));
    await searchTmdb("batman");

    expect(requestedUrl(0).searchParams.get("api_key")).toBe("v3key");
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  it("sends a v4 read-access token as a bearer header instead", async () => {
    process.env.TMDB_API_KEY = "eyJhbGciOiJIUzI1NiJ9.payload.sig";
    fetchMock.mockResolvedValue(ok({ results: [] }));
    await searchTmdb("batman");

    expect(requestedUrl(0).searchParams.get("api_key")).toBeNull();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
    });
  });

  it("raises an invalid-key error a caller can distinguish from a miss", async () => {
    fetchMock.mockResolvedValue(fail(401));

    await expect(searchTmdb("batman")).rejects.toMatchObject({
      name: "TmdbError",
      reason: "invalid-key",
    });
  });

  it("raises a rate-limited error on a 429", async () => {
    fetchMock.mockResolvedValue(fail(429));

    await expect(searchTmdb("batman")).rejects.toMatchObject({ reason: "rate-limited" });
  });

  it("treats a 404 as a plain miss rather than a source failure", async () => {
    fetchMock.mockResolvedValue(fail(404));

    await expect(searchTmdb("batman")).rejects.not.toBeInstanceOf(TmdbError);
  });
});

describe("searchTmdb", () => {
  const multiHit = {
    id: 414906,
    media_type: "movie",
    title: "The Batman",
    release_date: "2022-03-01",
    poster_path: "/poster.jpg",
    overview: "A plot.",
  };

  it("resolves each hit to its IMDb id and drops the ones without one", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          results: [multiHit, { ...multiHit, id: 99, title: "No Ids" }],
          total_results: 2,
        })
      )
      .mockResolvedValueOnce(ok({ imdb_id: "tt1877830" }))
      .mockResolvedValueOnce(ok({ imdb_id: null }));

    const { items, totalResults } = await searchTmdb("batman");

    expect(totalResults).toBe(2);
    expect(items).toEqual([
      {
        imdbId: "tt1877830",
        title: "The Batman",
        year: "2022",
        type: "movie",
        poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
        plot: "A plot.",
      },
    ]);
  });

  it("filters out people, who have neither a title nor an IMDb title id", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ results: [{ id: 1, media_type: "person", name: "Robert Pattinson" }] })
    );

    expect((await searchTmdb("pattinson")).items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the TV endpoint with a year filter for a series search", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ results: [{ id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" }] }))
      .mockResolvedValueOnce(ok({ imdb_id: "tt0903747" }));

    const { items } = await searchTmdb("breaking bad", { type: "series", year: "2008" });

    const url = requestedUrl(0);
    expect(url.pathname).toBe("/3/search/tv");
    expect(url.searchParams.get("first_air_date_year")).toBe("2008");
    expect(items[0]).toMatchObject({ imdbId: "tt0903747", type: "series" });
  });

  it("uses the movie endpoint with a year filter for a movie search", async () => {
    fetchMock.mockResolvedValueOnce(ok({ results: [] }));
    await searchTmdb("batman", { type: "movie", year: "2022" });

    const url = requestedUrl(0);
    expect(url.pathname).toBe("/3/search/movie");
    expect(url.searchParams.get("primary_release_year")).toBe("2022");
  });

  it("filters an untyped search by year itself, since /search/multi cannot", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ results: [multiHit, { ...multiHit, id: 2, release_date: "1989-06-23" }] })
    );
    fetchMock.mockResolvedValue(ok({ imdb_id: "tt1877830" }));

    const { items } = await searchTmdb("batman", { year: "2022" });

    expect(requestedUrl(0).pathname).toBe("/3/search/multi");
    expect(items).toHaveLength(1);
    expect(items[0].year).toBe("2022");
  });
});

describe("getTmdbDetailByImdb", () => {
  it("returns null when the IMDb id matches nothing", async () => {
    fetchMock.mockResolvedValueOnce(ok({ movie_results: [], tv_results: [] }));

    expect(await getTmdbDetailByImdb("tt0000000")).toBeNull();
  });

  it("maps a movie into a full detail record", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ movie_results: [{ id: 27205 }], tv_results: [] }))
      .mockResolvedValueOnce(
        ok({
          id: 27205,
          title: "Inception",
          overview: "A plot.",
          poster_path: "/poster.jpg",
          release_date: "2010-07-15",
          runtime: 148,
          revenue: 839030630,
          vote_average: 8.372,
          vote_count: 39679,
          genres: [{ id: 28, name: "Action" }],
          spoken_languages: [{ english_name: "English" }],
          production_countries: [{ name: "United Kingdom" }],
          credits: {
            cast: [{ name: "Leonardo DiCaprio" }],
            crew: [
              { name: "Christopher Nolan", job: "Director" },
              { name: "Christopher Nolan", job: "Writer" },
            ],
          },
          release_dates: {
            results: [{ iso_3166_1: "AU", release_dates: [{ certification: "M" }] }],
          },
        })
      );

    expect(await getTmdbDetailByImdb("tt1375666")).toEqual({
      imdbId: "tt1375666",
      title: "Inception",
      year: "2010",
      type: "movie",
      poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
      plot: "A plot.",
      rating: "8.4",
      votes: "39,679",
      runtime: "148 min",
      genres: ["Action"],
      director: "Christopher Nolan",
      writer: "Christopher Nolan",
      actors: "Leonardo DiCaprio",
      language: "English",
      country: "United Kingdom",
      released: "15 Jul 2010",
      rated: "M",
      boxOffice: "$839,030,630",
      totalSeasons: undefined,
    });
  });

  it("maps a series, taking the showrunner as director and the season count", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ movie_results: [], tv_results: [{ id: 1396 }] }))
      .mockResolvedValueOnce(
        ok({
          id: 1396,
          name: "Breaking Bad",
          first_air_date: "2008-01-20",
          number_of_seasons: 5,
          episode_run_time: [47],
          created_by: [{ name: "Vince Gilligan" }],
          aggregate_credits: { cast: [{ name: "Bryan Cranston" }] },
          content_ratings: { results: [{ iso_3166_1: "AU", rating: "MA 15+" }] },
        })
      );

    expect(await getTmdbDetailByImdb("tt0903747")).toMatchObject({
      type: "series",
      director: "Vince Gilligan",
      actors: "Bryan Cranston",
      totalSeasons: "5",
      runtime: "47 min",
      rated: "MA 15+",
      released: "20 Jan 2008",
    });
  });

  it("prefers an AU certification over a US one", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ movie_results: [{ id: 1 }], tv_results: [] }))
      .mockResolvedValueOnce(
        ok({
          id: 1,
          release_dates: {
            results: [
              { iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] },
              { iso_3166_1: "AU", release_dates: [{ certification: "M" }] },
            ],
          },
        })
      );

    expect((await getTmdbDetailByImdb("tt1"))?.rated).toBe("M");
  });

  it("falls back to the find hit when the detail call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          movie_results: [
            { id: 27205, title: "Inception", release_date: "2010-07-15", poster_path: "/p.jpg" },
          ],
          tv_results: [],
        })
      )
      .mockResolvedValueOnce(fail(500));

    expect(await getTmdbDetailByImdb("tt1375666")).toMatchObject({
      imdbId: "tt1375666",
      title: "Inception",
      year: "2010",
      poster: "https://image.tmdb.org/t/p/w500/p.jpg",
    });
  });

  it("omits box office and rating when TMDB has no figures", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ movie_results: [{ id: 1 }], tv_results: [] }))
      .mockResolvedValueOnce(ok({ id: 1, title: "Obscure", revenue: 0, vote_average: 0 }));

    const detail = await getTmdbDetailByImdb("tt1");
    expect(detail?.boxOffice).toBeUndefined();
    expect(detail?.rating).toBeUndefined();
  });
});
