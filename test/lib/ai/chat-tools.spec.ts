/** @jest-environment node */

jest.mock("@/lib/library/add-download", () => ({ addDownload: jest.fn() }));

import { addDownload } from "@/lib/library/add-download";
import {
  MODEL_TORRENTS_PER_MOVIE,
  MODEL_TORRENT_LIMIT,
  chatTools,
  executeDownload,
  slimMovieSearch,
  slimTorrentSearch,
} from "@/lib/ai/chat-tools";
import { clearMagnetRegistry, rememberMagnet } from "@/lib/api/magnet-registry";
import type { TorrentLink } from "@/lib/api/types";

const addDownloadMock = addDownload as jest.MockedFunction<typeof addDownload>;

const TRACKERS = Array.from(
  { length: 18 },
  (_, i) => `&tr=udp%3A%2F%2Ftracker${i}.example.org%3A1337%2Fannounce`
).join("");

function hashFor(n: number): string {
  return n.toString(16).padStart(40, "0");
}

function magnetFor(n: number): string {
  return `magnet:?xt=urn:btih:${hashFor(n)}&dn=Torrent.${n}.1080p.BluRay${TRACKERS}`;
}

function torrent(n: number): TorrentLink {
  const magnet = magnetFor(n);
  return {
    title: `Torrent ${n} 1080p BluRay`,
    provider: "ThePirateBay",
    seeds: 100 - n,
    peers: 10,
    size: "2.1 GB",
    magnet,
    id: rememberMagnet(magnet) ?? undefined,
  };
}

function torrents(count: number): TorrentLink[] {
  return Array.from({ length: count }, (_, i) => torrent(i + 1));
}

describe("slimTorrentSearch", () => {
  beforeEach(() => clearMagnetRegistry());

  it("sends no magnet link to the model", () => {
    const slim = slimTorrentSearch({ query: "suits", torrents: torrents(5) });

    expect(JSON.stringify(slim)).not.toContain("magnet:");
    expect(JSON.stringify(slim)).not.toContain("tracker0.example.org");
  });

  it("references each torrent by its info hash instead", () => {
    const slim = slimTorrentSearch({ query: "suits", torrents: torrents(3) });

    expect(slim.torrents.map((t) => t.id)).toEqual([hashFor(1), hashFor(2), hashFor(3)]);
  });

  it("caps how many torrents reach the model", () => {
    const slim = slimTorrentSearch({ query: "suits", torrents: torrents(15) });

    expect(slim.torrents).toHaveLength(MODEL_TORRENT_LIMIT);
  });

  it("keeps the fields the model picks on", () => {
    const slim = slimTorrentSearch({ query: "suits", torrents: torrents(1) });

    expect(slim.torrents[0]).toEqual({
      id: hashFor(1),
      title: "Torrent 1 1080p BluRay",
      seeds: 99,
      size: "2.1 GB",
      provider: "ThePirateBay",
    });
  });

  it("drops torrents that produced no id, since they cannot be downloaded", () => {
    const unusable: TorrentLink = { ...torrent(1), magnet: undefined, id: undefined };
    const slim = slimTorrentSearch({ query: "suits", torrents: [unusable, torrent(2)] });

    expect(slim.torrents).toHaveLength(1);
    expect(slim.torrents[0].id).toBe(hashFor(2));
  });

  it("cuts the payload the model pays for by an order of magnitude", () => {
    const full = { query: "suits", torrents: torrents(15) };
    const fullSize = JSON.stringify(full).length;
    const slimSize = JSON.stringify(slimTorrentSearch(full)).length;

    expect(slimSize).toBeLessThan(fullSize / 10);
  });
});

describe("slimMovieSearch", () => {
  beforeEach(() => clearMagnetRegistry());

  const movieOutput = {
    query: "inception",
    totalFound: 1,
    results: [
      {
        imdbId: "tt1375666",
        title: "Inception",
        year: "2010",
        type: "movie",
        poster: "https://example.test/a-very-long-poster-url.jpg",
        cast: "Leonardo DiCaprio, Joseph Gordon-Levitt",
        torrentLinks: torrents(6),
      },
    ],
  };

  it("sends no magnet link to the model", () => {
    expect(JSON.stringify(slimMovieSearch(movieOutput))).not.toContain("magnet:");
  });

  it("drops poster and cast, which are rendered as cards rather than reasoned over", () => {
    const serialised = JSON.stringify(slimMovieSearch(movieOutput));

    expect(serialised).not.toContain("poster-url");
    expect(serialised).not.toContain("DiCaprio");
  });

  it("keeps the identity fields the model needs to talk about the film", () => {
    const slim = slimMovieSearch(movieOutput);

    expect(slim.results[0]).toMatchObject({
      imdbId: "tt1375666",
      title: "Inception",
      year: "2010",
      type: "movie",
    });
  });

  it("caps torrents attached per movie", () => {
    const slim = slimMovieSearch(movieOutput);

    expect(slim.results[0].torrents).toHaveLength(MODEL_TORRENTS_PER_MOVIE);
  });

  it("handles a movie with no torrents attached", () => {
    const slim = slimMovieSearch({
      query: "obscure",
      totalFound: 1,
      results: [{ imdbId: "tt0", title: "Obscure", year: "1999", type: "movie", poster: null }],
    });

    expect(slim.results[0].torrents).toEqual([]);
  });
});

describe("chatTools wiring", () => {
  beforeEach(() => clearMagnetRegistry());

  it("routes searchTorrents results through the slimmer before the model sees them", async () => {
    const output = { query: "suits", torrents: torrents(15) };

    const modelOutput = await chatTools.searchTorrents.toModelOutput!({
      toolCallId: "call-1",
      input: { query: "suits" },
      output,
    });

    expect(JSON.stringify(modelOutput)).not.toContain("magnet:");
  });

  it("routes searchMovies results through the slimmer before the model sees them", async () => {
    const output = {
      query: "inception",
      totalFound: 1,
      results: [
        {
          imdbId: "tt1375666",
          title: "Inception",
          year: "2010",
          type: "movie",
          poster: null,
          torrentLinks: torrents(4),
        },
      ],
    };

    const modelOutput = await chatTools.searchMovies.toModelOutput!({
      toolCallId: "call-2",
      input: { query: "inception" },
      output,
    });

    expect(JSON.stringify(modelOutput)).not.toContain("magnet:");
  });

  it("does not accept a magnet as download input, so the model cannot be asked for one", () => {
    const { jsonSchema } = chatTools.downloadTorrent.inputSchema as unknown as {
      jsonSchema: { properties: Record<string, unknown> };
    };

    expect(Object.keys(jsonSchema.properties)).toContain("torrentId");
    expect(Object.keys(jsonSchema.properties)).not.toContain("magnet");
  });
});

describe("executeDownload", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    clearMagnetRegistry();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    addDownloadMock.mockReset();
    addDownloadMock.mockResolvedValue({ success: true, message: "Started" });
    process.env.STORAGE_ROOT = "/srv/media";
  });

  it("expands the id back into the full magnet before sending it to qBittorrent", async () => {
    const magnet = magnetFor(1);
    const id = rememberMagnet(magnet)!;

    await executeDownload({ torrentId: id, title: "Torrent 1", contentType: "movie" });

    expect(addDownloadMock).toHaveBeenCalledWith(expect.objectContaining({ magnet }));
  });

  it("queues in-process rather than over HTTP, which cannot resolve the app's own host", async () => {
    const id = rememberMagnet(magnetFor(1))!;

    await executeDownload({ torrentId: id, title: "A", contentType: "movie" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the torrents directory, since the organiser files everything from there", async () => {
    const id = rememberMagnet(magnetFor(1))!;

    const movie = await executeDownload({ torrentId: id, title: "A", contentType: "movie" });
    const series = await executeDownload({ torrentId: id, title: "B", contentType: "series" });

    expect(movie.savePath).toBe("/srv/media/torrents");
    expect(series.savePath).toBe("/srv/media/torrents");
  });

  it("passes the content type through so the library records it", async () => {
    const id = rememberMagnet(magnetFor(1))!;

    await executeDownload({ torrentId: id, title: "A", contentType: "series" });

    expect(addDownloadMock).toHaveBeenCalledWith(expect.objectContaining({ type: "series" }));
  });

  it("tells the model to search again when the id means nothing", async () => {
    const result = await executeDownload({
      torrentId: "made-up-id",
      title: "Nope",
      contentType: "movie",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Search again");
    expect(addDownloadMock).not.toHaveBeenCalled();
  });

  it("surfaces a failed download rather than reporting success", async () => {
    const id = rememberMagnet(magnetFor(1))!;
    addDownloadMock.mockResolvedValue({ success: false, message: "qBittorrent unreachable" });

    const result = await executeDownload({ torrentId: id, title: "A", contentType: "movie" });

    expect(result).toMatchObject({ success: false, message: "qBittorrent unreachable" });
  });

  it("surfaces a thrown error rather than throwing into the agent loop", async () => {
    const id = rememberMagnet(magnetFor(1))!;
    addDownloadMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await executeDownload({ torrentId: id, title: "A", contentType: "movie" });

    expect(result).toMatchObject({ success: false, message: "ECONNREFUSED" });
  });
});
