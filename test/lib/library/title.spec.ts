/** @jest-environment node */

import {
  cleanTitle,
  declaredSeasons,
  libraryFolderName,
  libraryKey,
  looksLikeReleaseName,
  parseSeasonEpisode,
  startYear,
  stripYear,
  yearFromReleaseName,
} from "@/lib/library/title";

describe("cleanTitle", () => {
  it.each([
    ["Ugly Betty Season 1 Complete 720p AMZN WEBRip x264", "Ugly Betty"],
    ["Ugly Betty Season 4 Complete 720p AMZN WEBRip x264 [i_c]", "Ugly Betty"],
    [
      "Schmigadoon! (2021) Season 1 S01 (1080p ATVP WEB-DL x265 HEVC 10bit EAC3 Atmos 5.1 t3nzin)",
      "Schmigadoon!",
    ],
    ["The Chosen - Season 5 - Mp4 x264 AC3 1080p", "The Chosen"],
    ["The Chosen Season 1 to 4 Mp4 1080p", "The Chosen"],
    ["Clarkson's Farm 2021 Seasons 1 to 4 Complete 1080p WEB x264 [i_c]", "Clarkson's Farm"],
    ["Clarksons.Farm.S05.1080p.WEBRip.10Bit.DDP5.1.x265-NeoNoir", "Clarksons Farm"],
    [
      "Classroom.of.the.Elite.S03.1080p.BluRay.10-Bit.Dual-Audio.FLAC5.1.x265-YURASUKA",
      "Classroom of the Elite",
    ],
    [
      "[Anime Time] Jujutsu Kaisen (Season 1) [Dual Audio][BD][1080p][HEVC 10bit x265][AAC][Eng Sub] [Batch]",
      "Jujutsu Kaisen",
    ],
    ["New Girl (2011) Season 01-07 S01-S07 (Mixed x265 HEVC)", "New Girl"],
    ["The Golden Girls, Seasons 1 thru 7 Complete, X264", "The Golden Girls"],
    ["Creed 2015 1080p BluRay x264 DTS-JYK", "Creed"],
    ["Creed II (2018) [BluRay] [1080p] [YTS.AM]", "Creed II"],
    ["Companion (2025) [1080p] [WEBRip] [5.1] [YTS.MX]", "Companion"],
    ["Madagascar.Escape.2.Africa.2008.1080p.BluRay.DDP.5.1.x265-EDGE2020.mkv", "Madagascar Escape 2 Africa"],
    ["How to Lose a Guy in 10 Days 2003 1080p BluRay x264-OFT", "How to Lose a Guy in 10 Days"],
    ["www.UIndex.org    -    American Ultra 2015 1080p BluRay DTS-HD MA 7 1 x264-LEGi0N", "American Ultra"],
    ["Miller's Girl (2024) [1080p] WEB [x265-10bit Opus_5.1]", "Miller's Girl"],
  ])("reads the title out of %s", (raw, expected) => {
    expect(cleanTitle(raw)).toBe(expected);
  });

  it("leaves a title that is already clean alone", () => {
    expect(cleanTitle("Attack On Titan")).toBe("Attack On Titan");
    expect(cleanTitle("Mrs. Doubtfire")).toBe("Mrs. Doubtfire");
  });

  it("keeps a number that opens the title rather than reading it as a year", () => {
    expect(cleanTitle("1917 2019 1080p BluRay x264")).toBe("1917");
  });

  it("keeps a year-like number too far in the future to be a release year", () => {
    expect(cleanTitle("Blade Runner 2049 2017 1080p BluRay")).toBe("Blade Runner 2049");
  });
});

describe("startYear", () => {
  it.each([
    ["1985–1992", "1985"],
    ["2017–", "2017"],
    ["2010", "2010"],
  ])("reduces %s to a single year", (raw, expected) => {
    expect(startYear(raw)).toBe(expected);
  });

  it("has no year for a value that holds none", () => {
    expect(startYear("Unknown")).toBeNull();
    expect(startYear(null)).toBeNull();
  });
});

describe("yearFromReleaseName", () => {
  it("takes a bracketed year", () => {
    expect(yearFromReleaseName("Companion (2025) [1080p] [WEBRip]")).toBe("2025");
  });

  it("takes a bare year", () => {
    expect(yearFromReleaseName("Creed 2015 1080p BluRay x264")).toBe("2015");
  });

  it("does not read a resolution as a year", () => {
    expect(yearFromReleaseName("Ugly Betty Season 1 Complete 1080p x264")).toBeNull();
  });
});

describe("stripYear", () => {
  it.each([
    ["Ugly Betty (2006)", "Ugly Betty"],
    ["Classroom of the Elite (2017–)", "Classroom of the Elite"],
    ["The Golden Girls (1985–1992)", "The Golden Girls"],
    ["Blade Runner 2049", "Blade Runner 2049"],
  ])("turns %s into %s", (raw, expected) => {
    expect(stripYear(raw)).toBe(expected);
  });
});

describe("libraryKey", () => {
  it("treats punctuation variants as the same show", () => {
    expect(libraryKey("Schmigadoon! (2021)")).toBe(libraryKey("Schmigadoon (2021)"));
    expect(libraryKey("Clarkson's Farm (2021)")).toBe(libraryKey("Clarksons Farm"));
  });

  it("treats a year disagreement as the same show", () => {
    expect(libraryKey("Classroom of the Elite (2017–)")).toBe(
      libraryKey("Classroom of the Elite (2023)")
    );
  });

  it("matches a release-named folder to its clean equivalent", () => {
    expect(libraryKey("Ugly Betty Season 3 Complete 720p AMZN WEBRip x264 (2006)")).toBe(
      libraryKey("Ugly Betty (2006)")
    );
  });

  it("keeps genuinely different shows apart", () => {
    expect(libraryKey("The Chosen (2017)")).not.toBe(libraryKey("The Chosen One (2023)"));
  });
});

describe("looksLikeReleaseName", () => {
  it("flags a folder name that still carries release metadata", () => {
    expect(looksLikeReleaseName("Ugly Betty Season 1 Complete 720p AMZN WEBRip x264 (2006)")).toBe(
      true
    );
    expect(looksLikeReleaseName("Clarksons Farm (Unknown)")).toBe(true);
  });

  it("accepts a clean folder name", () => {
    expect(looksLikeReleaseName("Ugly Betty (2006)")).toBe(false);
    expect(looksLikeReleaseName("Schmigadoon! (2021)")).toBe(false);
    expect(looksLikeReleaseName("Madagascar 3: Europe's Most Wanted (2012)")).toBe(false);
  });
});

describe("parseSeasonEpisode", () => {
  it.each([
    ["Ugly Betty (2006) - s01e04.mkv", 1, 4],
    ["Classroom of the Elite - S03E13.mkv", 3, 13],
    ["Show.3x07.mkv", 3, 7],
    ["Show Season 2 Episode 11.mkv", 2, 11],
  ])("reads %s", (name, season, episode) => {
    expect(parseSeasonEpisode(name)).toEqual({ season, episode });
  });

  it("has no answer for absolute numbering", () => {
    expect(parseSeasonEpisode("[Anime Time] Attack On Titan - 55.mkv")).toBeNull();
  });
});

describe("declaredSeasons", () => {
  it.each([
    ["The Chosen - Season 5 - Mp4 x264 AC3 1080p", [5]],
    ["The Chosen Season 1 to 4 Mp4 1080p", [1, 2, 3, 4]],
    ["Clarksons.Farm.S05.1080p.WEBRip", [5]],
    ["New Girl (2011) Season 01-07 S01-S07 (x265 HEVC)", [1, 2, 3, 4, 5, 6, 7]],
    ["Schmigadoon! (2021) Season 2 S02 (1080p ATVP WEB-DL)", [2]],
    ["The Golden Girls, Seasons 1 thru 7 Complete, X264", [1, 2, 3, 4, 5, 6, 7]],
    ["Ugly Betty Season 2 Complete 720p AMZN WEBRip x264", [2]],
  ])("reads the seasons in %s", (name, expected) => {
    expect(declaredSeasons(name)).toEqual(expected);
  });

  it("declares nothing for a name that names no season", () => {
    expect(declaredSeasons("Companion (2025) [1080p] [WEBRip]")).toEqual([]);
  });

  it("keeps a season 5 pack from matching a season 1-4 pack", () => {
    const wanted = declaredSeasons("The Chosen - Season 5 - Mp4 x264 AC3 1080p");
    const other = declaredSeasons("The Chosen Season 1 to 4 Mp4 1080p");
    expect(wanted.some((s) => other.includes(s))).toBe(false);
  });
});

describe("libraryFolderName", () => {
  it("builds Title (Year) from a release name and a year range", () => {
    expect(libraryFolderName("Ugly Betty Season 1 Complete 720p x264", "2006")).toBe(
      "Ugly Betty (2006)"
    );
    expect(libraryFolderName("The Golden Girls", "1985–1992")).toBe("The Golden Girls (1985)");
  });

  it("omits the year when there is none", () => {
    expect(libraryFolderName("Attack On Titan", null)).toBe("Attack On Titan");
    expect(libraryFolderName("Clarksons Farm", "Unknown")).toBe("Clarksons Farm");
  });
});
