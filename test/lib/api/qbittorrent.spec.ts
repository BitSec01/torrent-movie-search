/** @jest-environment node */

jest.mock("@/lib/config", () => ({ torrentsDir: () => "/mnt/storage/torrents" }));

const HOST = "http://qbt.test:8090";

/** A Response carrying Set-Cookie headers, which `new Response()` cannot express. */
function withCookies(cookies: string[], init: ResponseInit = {}, body = ""): Response {
  const headers = new Headers(init.headers);
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(body || null, { ...init, headers });
}

/**
 * The client caches its session cookie at module scope, so every test needs its
 * own instance or a later login is skipped and the fetch order shifts.
 */
function loadClient(): typeof import("@/lib/api/qbittorrent") {
  let mod!: typeof import("@/lib/api/qbittorrent");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/lib/api/qbittorrent");
  });
  return mod;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.QBITTORRENT_HOST = HOST;
  process.env.QBITTORRENT_USERNAME = "admin";
  process.env.QBITTORRENT_PASSWORD = "secret";
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("extractHash", () => {
  it("pulls the btih out of a magnet link", () => {
    const { extractHash } = loadClient();
    expect(extractHash("magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567&dn=x")).toBe(
      "0123456789abcdef0123456789abcdef01234567"
    );
  });

  it("returns null when there is no hash", () => {
    const { extractHash } = loadClient();
    expect(extractHash("not-a-magnet")).toBeNull();
  });
});

describe("login against qBittorrent 5.x", () => {
  it("accepts a 204 with an empty body and the QBT_SID_<port> cookie", async () => {
    fetchMock
      .mockResolvedValueOnce(withCookies(["QBT_SID_8090=abc123; HttpOnly; path=/"], { status: 204 }))
      .mockResolvedValueOnce(new Response("v5.2.3", { status: 200 })) // credential probe
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ hash: "aa", name: "Movie" }]), { status: 200 })
      );

    await expect(loadClient().getTorrentsInfo()).resolves.toEqual([{ hash: "aa", name: "Movie" }]);
    expect(fetchMock.mock.calls[2][1].headers.Cookie).toBe("QBT_SID_8090=abc123");
  });

  it("reports rejected credentials when the probe 403s despite a cookie", async () => {
    fetchMock
      .mockResolvedValueOnce(withCookies(["QBT_SID_8090=bad; HttpOnly"], { status: 204 }))
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    await expect(loadClient().getTorrentsInfo()).rejects.toThrow(/rejected the credentials/);
  });
});

describe("login against qBittorrent 4.x", () => {
  it("accepts the Ok. body and the bare SID cookie", async () => {
    fetchMock
      .mockResolvedValueOnce(withCookies(["SID=legacy1; HttpOnly; path=/"], { status: 200 }, "Ok."))
      .mockResolvedValueOnce(new Response("v4.6.0", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await expect(loadClient().getTorrentsInfo()).resolves.toEqual([]);
    expect(fetchMock.mock.calls[2][1].headers.Cookie).toBe("SID=legacy1");
  });

  it("reports rejected credentials on a Fails. body", async () => {
    fetchMock.mockResolvedValueOnce(withCookies([], { status: 200 }, "Fails."));

    await expect(loadClient().getTorrentsInfo()).rejects.toThrow(/rejected the credentials/);
  });

  it("sends a Referer, which 4.x requires", async () => {
    fetchMock
      .mockResolvedValueOnce(withCookies(["SID=x"], { status: 200 }, "Ok."))
      .mockResolvedValueOnce(new Response("v4.6.0", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await loadClient().getTorrentsInfo();
    expect(fetchMock.mock.calls[0][1].headers.Referer).toBe(HOST);
  });
});

describe("addTorrent", () => {
  it("treats a 200 with a Fails. body as a refusal, not a success", async () => {
    fetchMock
      .mockResolvedValueOnce(withCookies(["QBT_SID_8090=abc"], { status: 204 }))
      .mockResolvedValueOnce(new Response("v5.2.3", { status: 200 }))
      .mockResolvedValueOnce(new Response("Fails.", { status: 200 }));

    await expect(loadClient().addTorrent("magnet:?xt=urn:btih:aa")).resolves.toEqual({
      success: false,
      message: "qBittorrent refused the magnet link",
    });
  });

  it("reports success on an accepted magnet", async () => {
    fetchMock
      .mockResolvedValueOnce(withCookies(["QBT_SID_8090=abc"], { status: 204 }))
      .mockResolvedValueOnce(new Response("v5.2.3", { status: 200 }))
      .mockResolvedValueOnce(new Response("Ok.", { status: 200 }));

    const result = await loadClient().addTorrent("magnet:?xt=urn:btih:aa");
    expect(result.success).toBe(true);
  });
});
