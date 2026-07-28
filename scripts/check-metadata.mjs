#!/usr/bin/env node
/**
 * Metadata source health check.
 *
 * Hits every configured metadata source with one real query and reports which
 * are up, whether they returned data, and — for OMDb — whether it is rate
 * limited. Reads the same env vars the app does.
 *
 *   node scripts/check-metadata.mjs [query]
 *
 * Keys come from the environment (OMDB_API_KEY, TMDB_API_KEY). Load a .env with
 * `node --env-file=.env scripts/check-metadata.mjs` if they are not already set.
 */

const query = process.argv[2] || "the batman";
const sampleImdbId = "tt1877830"; // The Batman (2022), for the detail-by-id probes

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function line(label, ok, detail) {
  const mark = ok === true ? `${GREEN}ok ${RESET}` : ok === "warn" ? `${YELLOW}warn${RESET}` : `${RED}fail${RESET}`;
  console.log(`  ${mark}  ${label.padEnd(16)} ${DIM}${detail}${RESET}`);
}

async function checkOmdb() {
  const key = process.env.OMDB_API_KEY;
  if (!key) return line("OMDb", "warn", "OMDB_API_KEY not set — skipped");
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&s=${encodeURIComponent(query)}`);
    const body = await res.json();
    if (body.Response === "True") return line("OMDb", true, `${body.Search?.length ?? 0} results`);
    // OMDb returns 401 with a distinct message for a bad key vs. an exhausted quota.
    const limited = /request limit/i.test(body.Error ?? "");
    return line("OMDb", "warn", `${body.Error ?? "no results"}${limited ? " (quota, not a bad key)" : ""}`);
  } catch (err) {
    return line("OMDb", false, err.message);
  }
}

async function checkImdbProxy() {
  try {
    const res = await fetch(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return line("IMDb proxy", false, `HTTP ${res.status}`);
    const body = await res.json();
    if (body.ok) return line("IMDb proxy", true, `${body.description?.length ?? 0} results`);
    return line("IMDb proxy", false, body.error_message ?? "not ok");
  } catch (err) {
    return line("IMDb proxy", false, err.message);
  }
}

async function checkTmdb() {
  const key = (process.env.TMDB_API_KEY || "").trim();
  if (!key) return line("TMDB", "warn", "TMDB_API_KEY not set — skipped");
  const isJwt = key.startsWith("eyJ");
  const auth = isJwt ? { headers: { Authorization: `Bearer ${key}` } } : {};
  const keyParam = isJwt ? "" : `&api_key=${encodeURIComponent(key)}`;
  try {
    const searchRes = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false${keyParam}`,
      auth
    );
    if (!searchRes.ok) return line("TMDB", false, `search HTTP ${searchRes.status} (${isJwt ? "v4 token" : "v3 key"})`);
    const searchBody = await searchRes.json();
    const hits = (searchBody.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv");

    // Also confirm the /find path the detail page depends on resolves an IMDb id.
    const findRes = await fetch(
      `https://api.themoviedb.org/3/find/${sampleImdbId}?external_source=imdb_id${keyParam}`,
      auth
    );
    const findBody = await findRes.json();
    const found = (findBody.movie_results?.length ?? 0) + (findBody.tv_results?.length ?? 0);
    return line("TMDB", true, `${hits.length} search hits, /find resolves ${found} (${isJwt ? "v4 token" : "v3 key"})`);
  } catch (err) {
    return line("TMDB", false, err.message);
  }
}

console.log(`\nMetadata sources — query "${query}"\n`);
await Promise.all([checkOmdb(), checkImdbProxy(), checkTmdb()]);
console.log("");
