/** @jest-environment node */

process.env.STORAGE_ROOT = "/mnt/storage";

import { normalizePlan, type RawPlan, type NormalizeContext } from "@/lib/library/normalize-plan";

const MOVIES = "/mnt/storage/Movies";
const SERIES = "/mnt/storage/Series";
const TORRENTS = "/mnt/storage/torrents";

function context(overrides: Partial<NormalizeContext> = {}): NormalizeContext {
  return {
    existingFolders: { movies: [], series: [] },
    releaseName: "release",
    ...overrides,
  };
}

function seriesPlan(overrides: Partial<RawPlan> = {}): RawPlan {
  return {
    mediaType: "series",
    destinationBase: SERIES,
    rootFolder: "Show (2000)",
    metadata: { title: "Show", year: "2000" },
    operations: [],
    ...overrides,
  };
}

describe("normalizePlan root folder", () => {
  it("replaces a release name used as a folder name with the title", () => {
    const plan = seriesPlan({
      rootFolder: "Ugly Betty Season 3 Complete 720p AMZN WEBRip x264 (2006)",
      metadata: { title: "Ugly Betty Season 3 Complete 720p AMZN WEBRip x264", year: "2006" },
      operations: [
        {
          sourceAbsPath: `${TORRENTS}/Ugly Betty Season 3/ep.mkv`,
          destRelPath: "Season 03/Ugly Betty Season 3 Complete 720p AMZN WEBRip x264 (2006) - s03e01.mkv",
        },
      ],
    });

    const result = normalizePlan(
      plan,
      context({ releaseName: "Ugly Betty Season 3 Complete 720p AMZN WEBRip x264 [i_c]" })
    );

    expect(result.rootFolder).toBe("Ugly Betty (2006)");
    expect(result.operations[0].destRelPath).toBe("Season 03/Ugly Betty (2006) - s03e01.mkv");
  });

  it("files a later season into the folder the show already has", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "Ugly Betty Season 4 Complete 720p AMZN WEBRip x264 (2006)",
        metadata: { title: "Ugly Betty", year: "2006" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/ub4/ep.mkv`, destRelPath: "Season 04/x - s04e01.mkv" },
        ],
      }),
      context({
        existingFolders: { movies: [], series: ["Ugly Betty (2006)"] },
        releaseName: "Ugly Betty Season 4 Complete 720p AMZN WEBRip x264 [i_c]",
      })
    );

    expect(result.rootFolder).toBe("Ugly Betty (2006)");
  });

  it("merges a punctuation variant into the existing folder", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "Schmigadoon (2021)",
        metadata: { title: "Schmigadoon", year: "2021" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/s2/ep.mkv`, destRelPath: "Season 02/x - s02e01.mkv" },
        ],
      }),
      context({
        existingFolders: { movies: [], series: ["Schmigadoon! (2021)"] },
        releaseName: "Schmigadoon! (2021) Season 2 S02 (1080p ATVP WEB-DL)",
      })
    );

    expect(result.rootFolder).toBe("Schmigadoon! (2021)");
    expect(result.operations[0].destRelPath).toBe("Season 02/Schmigadoon! (2021) - s02e01.mkv");
  });

  it("does not adopt an existing folder that is itself a release name", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "The Chosen (2017)",
        metadata: { title: "The Chosen", year: "2017" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/tc/ep.mp4`, destRelPath: "Season 05/x - s05e01.mp4" },
        ],
      }),
      context({
        existingFolders: { movies: [], series: ["The Chosen Season 1 to 4 Mp4 1080p"] },
        releaseName: "The Chosen - Season 5 - Mp4 x264 AC3 1080p",
      })
    );

    expect(result.rootFolder).toBe("The Chosen (2017)");
  });

  it("reduces a year range to the year the show started", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "Classroom of the Elite (2017–)",
        metadata: { title: "Classroom of the Elite", year: "2017–" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/cote/ep.mkv`, destRelPath: "Season 03/x - s03e01.mkv" },
        ],
      }),
      context({ releaseName: "Classroom.of.the.Elite.S03.1080p.BluRay" })
    );

    expect(result.rootFolder).toBe("Classroom of the Elite (2017)");
  });

  it("drops an unknown year rather than naming a folder after it", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "Clarksons Farm (Unknown)",
        metadata: { title: "Clarksons Farm", year: "Unknown" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/cf/ep.mkv`, destRelPath: "Season 05/x - s05e01.mkv" },
        ],
      }),
      context({ releaseName: "Clarksons.Farm.S05.1080p.WEBRip" })
    );

    expect(result.rootFolder).toBe("Clarksons Farm");
  });

  it("leaves a clean title alone even when it contains a release word", () => {
    const result = normalizePlan(
      {
        mediaType: "movie",
        destinationBase: MOVIES,
        rootFolder: "Complete Unknown (2024)",
        metadata: { title: "Complete Unknown", year: "2024" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/cu/film.mkv`, destRelPath: "Complete Unknown (2024).mkv" },
        ],
      },
      context({ releaseName: "Complete Unknown (2024) [1080p] [WEBRip]" })
    );

    expect(result.rootFolder).toBe("Complete Unknown (2024)");
  });
});

describe("normalizePlan operations", () => {
  it("files an episode by the season in its own name, not the one the model chose", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "Classroom of the Elite (2017)",
        metadata: { title: "Classroom of the Elite", year: "2017" },
        operations: [
          {
            sourceAbsPath: `${TORRENTS}/cote/S03E13.mkv`,
            destRelPath: "Season 01/Classroom of the Elite (2017) - s03e13.mkv",
          },
        ],
      }),
      context({ releaseName: "Classroom.of.the.Elite.S03.1080p" })
    );

    expect(result.operations[0].destRelPath).toBe(
      "Season 03/Classroom of the Elite (2017) - s03e13.mkv"
    );
  });

  it("keeps a subtitle language tag through the rename", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "Suits (2011)",
        metadata: { title: "Suits", year: "2011" },
        operations: [
          {
            sourceAbsPath: `${TORRENTS}/suits/English.srt`,
            destRelPath: "Season 01/whatever - s01e02.en.srt",
          },
        ],
      }),
      context({ releaseName: "Suits.S01.1080p" })
    );

    expect(result.operations[0].destRelPath).toBe("Season 01/Suits (2011) - s01e02.en.srt");
  });

  it("keeps regional and forced subtitle tags apart", () => {
    const result = normalizePlan(
      {
        mediaType: "movie",
        destinationBase: MOVIES,
        rootFolder: "Companion (2025)",
        metadata: { title: "Companion", year: "2025" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/c/a.srt`, destRelPath: "old name.en.srt" },
          { sourceAbsPath: `${TORRENTS}/c/b.srt`, destRelPath: "old name.en.forced.srt" },
          { sourceAbsPath: `${TORRENTS}/c/c.srt`, destRelPath: "old name.fr-CA.srt" },
        ],
      },
      context({ releaseName: "Companion (2025) [1080p] [WEBRip]" })
    );

    expect(result.operations.map((o) => o.destRelPath)).toEqual([
      "Companion (2025).en.srt",
      "Companion (2025).en.forced.srt",
      "Companion (2025).fr-ca.srt",
    ]);
  });

  it("flattens a movie to a single file named after its folder", () => {
    const result = normalizePlan(
      {
        mediaType: "movie",
        destinationBase: MOVIES,
        rootFolder: "Creed (2015)",
        metadata: { title: "Creed", year: "2015" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/creed/x.mkv`, destRelPath: "extras/Creed 2015 BluRay.mkv" },
        ],
      },
      context({ releaseName: "Creed 2015 1080p BluRay x264 DTS-JYK" })
    );

    expect(result.operations[0].destRelPath).toBe("Creed (2015).mkv");
  });

  it("leaves absolutely numbered episodes where the model put them", () => {
    const result = normalizePlan(
      seriesPlan({
        rootFolder: "Attack on Titan (2013)",
        metadata: { title: "Attack on Titan", year: "2013" },
        operations: [
          {
            sourceAbsPath: `${TORRENTS}/aot/[Anime Time] Attack On Titan - 55.mkv`,
            destRelPath: "Season 03/[Anime Time] Attack On Titan - 55.mkv",
          },
        ],
      }),
      context({ releaseName: "[Anime Time] Attack On Titan [Batch]" })
    );

    expect(result.operations[0].destRelPath).toBe("Season 03/[Anime Time] Attack On Titan - 55.mkv");
  });

  it("keeps the model's layout when a rename would collide", () => {
    const result = normalizePlan(
      {
        mediaType: "movie",
        destinationBase: MOVIES,
        rootFolder: "Creed (2015)",
        metadata: { title: "Creed", year: "2015" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/creed/part1.mkv`, destRelPath: "part1.mkv" },
          { sourceAbsPath: `${TORRENTS}/creed/part2.mkv`, destRelPath: "part2.mkv" },
        ],
      },
      context({ releaseName: "Creed 2015 1080p BluRay" })
    );

    expect(result.operations.map((o) => o.destRelPath)).toEqual(["Creed (2015).mkv", "part2.mkv"]);
  });
});

describe("normalizePlan destination", () => {
  it("routes numbered episodes to Series even when the model called it a movie", () => {
    const result = normalizePlan(
      {
        mediaType: "movie",
        destinationBase: MOVIES,
        rootFolder: "WeCrashed (2022)",
        metadata: { title: "WeCrashed", year: "2022" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/wc/S01E01.mkv`, destRelPath: "WeCrashed (2022) - s01e01.mkv" },
        ],
      },
      context({ releaseName: "WeCrashed (2022) Season 1 S01 (1080p ATVP WEB-DL)" })
    );

    expect(result.mediaType).toBe("series");
    expect(result.destinationBase).toBe(SERIES);
    expect(result.operations[0].destRelPath).toBe("Season 01/WeCrashed (2022) - s01e01.mkv");
  });

  it("sends a movie to Movies", () => {
    const result = normalizePlan(
      {
        mediaType: "movie",
        destinationBase: SERIES,
        rootFolder: "Companion (2025)",
        metadata: { title: "Companion", year: "2025" },
        operations: [
          { sourceAbsPath: `${TORRENTS}/comp/x.mkv`, destRelPath: "Companion (2025).mkv" },
        ],
      },
      context({ releaseName: "Companion (2025) [1080p] [WEBRip]" })
    );

    expect(result.destinationBase).toBe(MOVIES);
  });
});
