// A title's scores from the places people look them up: the Tomatometer
// (critics) and Popcornmeter (audience) as percentages, and IMDb out of 10,
// each with how many reviews or votes stand behind it. They come from MDBList
// through FlickCue's title service, and saved titles carry the same fields
// when the extension has looked them up (criticScore, audienceScore,
// imdbRating, and their counts).

import { PROXY_BASE_URL } from "./config";
import type { Movie } from "./types";

export interface Score {
  value: number;
  /** Reviews or votes behind it, when known. */
  count?: number;
}

export interface RatingSet {
  critic?: Score;
  audience?: Score;
  imdb?: Score;
}

const number = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(n) ? n : null;
};

const percent = (value: unknown) => {
  const n = number(value);
  return n !== null && n >= 0 && n <= 100 ? Math.round(n) : null;
};

const countOf = (value: unknown) => {
  const n = number(value);
  return n !== null && n > 0 ? Math.round(n) : undefined;
};

/** MDBList's `ratings` array, down to the three scores (the same sources the extension reads). */
export function parseMdbListRatings(data: unknown): RatingSet {
  const ratings: any[] = Array.isArray((data as any)?.ratings) ? (data as any).ratings : [];
  const find = (...sources: string[]) => ratings.find((entry) => sources.includes(String(entry?.source ?? "").toLowerCase()));
  const out: RatingSet = {};
  const critic = find("tomatoes", "tomatometerallcritics");
  const audience = find("popcorn", "tomatoesaudience", "audience");
  const imdb = find("imdb");
  const criticValue = percent(critic?.value);
  const audienceValue = percent(audience?.value);
  const imdbValue = number(imdb?.value);
  if (criticValue !== null) out.critic = { value: criticValue, count: countOf(critic?.votes) };
  if (audienceValue !== null) out.audience = { value: audienceValue, count: countOf(audience?.votes) };
  if (imdbValue !== null && imdbValue > 0 && imdbValue <= 10) out.imdb = { value: Math.round(imdbValue * 10) / 10, count: countOf(imdb?.votes) };
  return out;
}

/** What a saved title already carries (the extension writes these), as a rating set. */
export function savedRatings(movie: Pick<Movie, "criticScore" | "audienceScore" | "imdbRating"> & Record<string, unknown>): RatingSet {
  const out: RatingSet = {};
  const critic = percent(movie.criticScore);
  const audience = percent(movie.audienceScore);
  const imdb = number(movie.imdbRating);
  if (critic !== null && movie.criticScore != null) out.critic = { value: critic, count: countOf(movie.criticCount) };
  if (audience !== null && movie.audienceScore != null) out.audience = { value: audience, count: countOf(movie.audienceCount) };
  if (imdb !== null && imdb > 0) out.imdb = { value: Math.round(imdb * 10) / 10, count: countOf(movie.imdbVotes) };
  return out;
}

/** Freshly fetched scores win; a score or count it lacks is filled from what the title carries. */
export function mergeRatings(fetched: RatingSet, saved: RatingSet): RatingSet {
  const out: RatingSet = {};
  for (const key of ["critic", "audience", "imdb"] as const) {
    const first = fetched[key] ?? saved[key];
    if (first) out[key] = { value: first.value, count: first.count ?? saved[key]?.count };
  }
  return out;
}

/** The fields a saved title is missing, to write back so its card shows its scores too (never replacing what's there). */
export function missingRatingFields(movie: Movie, ratings: RatingSet): Partial<Movie> {
  const have = savedRatings(movie);
  const fields: Record<string, number> = {};
  if (ratings.critic && !have.critic) {
    fields.criticScore = ratings.critic.value;
    if (ratings.critic.count) fields.criticCount = ratings.critic.count;
  }
  if (ratings.audience && !have.audience) {
    fields.audienceScore = ratings.audience.value;
    if (ratings.audience.count) fields.audienceCount = ratings.audience.count;
  }
  if (ratings.imdb && !have.imdb) {
    fields.imdbRating = ratings.imdb.value;
    if (ratings.imdb.count) fields.imdbVotes = ratings.imdb.count;
  }
  return fields;
}

/** "436", "25K", "328.5K", "1.2M". */
export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(Math.round(count / 100_000) / 10).toString().replace(/\.0$/, "")}M`;
  if (count >= 1000) return `${(Math.round(count / 100) / 10).toString().replace(/\.0$/, "")}K`;
  return String(count);
}

const STORE_KEY = "flickcue.ratings";
const KEEP_MS = 24 * 60 * 60 * 1000;
const KEEP_TITLES = 200;

type Stored = Record<string, { at: number; ratings: RatingSet }>;

function readStore(): Stored {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeStore(store: Stored) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP_TITLES))));
  } catch {
    // Without storage the scores are asked for again next time.
  }
}

const pending = new Map<string, Promise<RatingSet>>();
/** When a lookup last failed, so a service that is down or not set up yet is asked again in ten minutes, not on every page. */
const failedAt = new Map<string, number>();
const RETRY_MS = 10 * 60 * 1000;

/** The title's scores: kept ones when under a day old, otherwise asked of the title service (nothing when it can't answer). */
export function fetchRatings(tmdbType: string | undefined, tmdbId: string | undefined, now = Date.now()): Promise<RatingSet> {
  if ((tmdbType !== "movie" && tmdbType !== "tv") || !/^\d{1,10}$/.test(String(tmdbId ?? ""))) return Promise.resolve({});
  const key = `${tmdbType}:${tmdbId}`;
  const kept = readStore()[key];
  if (kept && now - kept.at < KEEP_MS) return Promise.resolve(kept.ratings);
  const running = pending.get(key);
  if (running) return running;
  const failed = failedAt.get(key);
  if (failed && now - failed < RETRY_MS) return Promise.resolve({});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const request = fetch(`${PROXY_BASE_URL}/mdblist/tmdb/${tmdbType === "tv" ? "show" : "movie"}/${tmdbId}/`, { headers: { Accept: "application/json" }, signal: controller.signal })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((data) => {
      const ratings = parseMdbListRatings(data);
      writeStore({ ...readStore(), [key]: { at: now, ratings } });
      return ratings;
    })
    .catch((): RatingSet => {
      failedAt.set(key, now);
      return {};
    })
    .finally(() => {
      clearTimeout(timer);
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}
