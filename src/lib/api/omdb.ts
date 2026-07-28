import type { OmdbSearchResponse, OmdbDetailResponse } from "./types";

const BASE = "https://www.omdbapi.com";

/**
 * OMDb reports every key-level problem the same way: HTTP 401, with the only
 * distinguishing detail in the body. Reading just the status collapses "this
 * key was never activated" and "this key is out of requests for today" into one
 * message, which is the difference between clicking a link and waiting a day.
 */
export class OmdbError extends Error {
  constructor(
    message: string,
    readonly reason: "invalid-key" | "rate-limited" | "unknown"
  ) {
    super(message);
    this.name = "OmdbError";
  }
}

function apiKey(): string {
  const key = process.env.OMDB_API_KEY;
  if (!key) throw new Error("OMDB_API_KEY is not set");
  return key;
}

function classify(error: string): OmdbError {
  if (/invalid api key/i.test(error)) {
    return new OmdbError(
      `${error} A new OMDb key stays invalid until the activation link in its signup email is opened.`,
      "invalid-key"
    );
  }
  if (/request limit/i.test(error)) {
    return new OmdbError(`${error} The key is valid but out of quota until OMDb's daily reset.`, "rate-limited");
  }
  return new OmdbError(error, "unknown");
}

async function request<T>(params: URLSearchParams, revalidate: number): Promise<T> {
  const res = await fetch(`${BASE}/?${params}`, { next: { revalidate } });
  const body = await res.json().catch(() => null);

  // A miss ("Movie not found!") comes back as a 200 and is an ordinary empty
  // result, so only the 401s are worth raising.
  if (!res.ok) throw classify(body?.Error ?? `OMDb request failed: ${res.status}`);

  return body as T;
}

export async function searchOmdb(
  query: string,
  options?: { type?: string; year?: string; page?: number }
): Promise<OmdbSearchResponse> {
  const params = new URLSearchParams({
    apikey: apiKey(),
    s: query,
    r: "json",
  });
  if (options?.type) params.set("type", options.type);
  if (options?.year) params.set("y", options.year);
  if (options?.page) params.set("page", String(options.page));

  return request<OmdbSearchResponse>(params, 300);
}

export async function getOmdbDetail(
  imdbId: string,
  plot: "short" | "full" = "full"
): Promise<OmdbDetailResponse> {
  const params = new URLSearchParams({
    apikey: apiKey(),
    i: imdbId,
    plot,
    r: "json",
  });

  return request<OmdbDetailResponse>(params, 600);
}
