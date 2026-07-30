import { omdbApiKey, omdbBase } from "@/lib/config";
import { MetadataSourceError } from "./errors";
import type { OmdbSearchResponse, OmdbDetailResponse } from "./types";

/**
 * OMDb reports every key-level problem the same way: HTTP 401, with the only
 * distinguishing detail in the body. Reading just the status collapses "this
 * key was never activated" and "this key is out of requests for today" into one
 * message, which is the difference between clicking a link and waiting a day.
 */
export class OmdbError extends MetadataSourceError {
  constructor(message: string, reason: "invalid-key" | "rate-limited" | "unknown") {
    super("Omdb", message, reason);
  }
}

/** OMDb is a supplement, not a dependency — an unset key skips it entirely. */
export function omdbConfigured(): boolean {
  return omdbApiKey().length > 0;
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
  const res = await fetch(`${omdbBase()}/?${params}`, { next: { revalidate } });
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
    apikey: omdbApiKey(),
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
    apikey: omdbApiKey(),
    i: imdbId,
    plot,
    r: "json",
  });

  return request<OmdbDetailResponse>(params, 600);
}
