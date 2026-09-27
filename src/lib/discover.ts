// Ranking for search and recommendations. Pure functions over raw TMDB
// results, so they can be tested without the network.

import type { Movie } from "./types";

/** Lowercase, accents and punctuation stripped: "Amélie" and "amelie" match, as do "&" and "and". */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * "dune 2021" or "Dune (2021)" -> { text: "dune", year: "2021" }. A bare "1917"
 * stays a title. The year might also be part of a title ("Blade Runner 2049"),
 * so callers search with and without it and rank against both.
 */
export function splitYear(query: string): { text: string; year: string } {
  const raw = query.trim();
  const match = raw.match(/\s\(?((?:18|19|20)\d{2})\)?$/);
  if (!match) return { text: raw, year: "" };
  return { text: raw.slice(0, match.index).trim(), year: match[1] };
}

/**
 * How well a TMDB search result answers the query. Title match dominates;
 * among equally good matches, well-known titles (many votes) come first, so
 * "Dune" puts the 2021 film above an obscure short with the same name.
 */
function titleMatch(names: string[], wanted: string): number {
  if (!wanted) return 0;
  if (names.includes(wanted)) return 6;
  if (names.some((name) => name.startsWith(wanted))) return 3.5;
  if (names.some((name) => name.includes(wanted))) return 1.5;
  return 0;
}

export function relevance(item: any, wanted: string[], year = ""): number {
  const names = [item.title, item.name, item.original_title, item.original_name].filter(Boolean).map((name: string) => normalizeQuery(name));
  // wanted[0] is the query as typed; a match on it beats a match on the
  // year-stripped text, so "blade runner 2049" isn't answered with the 1982 film.
  let score = Math.max(0, ...wanted.map((text, index) => titleMatch(names, text) - (index ? 0.75 : 0)));

  score += Math.min(Math.log10((Number(item.vote_count) || 0) + 1), 4) * 0.9;
  score += Math.min(Math.log10((Number(item.popularity) || 0) + 1), 3) * 0.5;

  const date = String(item.release_date || item.first_air_date || "");
  if (year && date.startsWith(year)) score += 4;
  if (!item.poster_path) score -= 2;
  return score;
}

export function rankSearchResults(results: any[], query: string): any[] {
  const { text, year } = splitYear(query);
  const wanted = [normalizeQuery(query), ...(year ? [normalizeQuery(text)] : [])];
  const seen = new Set<string>();
  return results
    .filter((item) => {
      const key = `${item.media_type}:${item.id}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .map((item) => ({ item, score: relevance(item, wanted, year) }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/** The person a search is about, when the query is clearly a name ("Greta Gerwig"). */
export function matchPerson(results: any[], query: string): any | undefined {
  const wanted = normalizeQuery(splitYear(query).text);
  if (wanted.length < 3) return undefined;
  const people = results.filter((item) => item.media_type === "person" && item.profile_path);
  return people.find((person) => normalizeQuery(person.name) === wanted)
    ?? (results[0]?.media_type === "person" && normalizeQuery(results[0].name).startsWith(wanted) ? results[0] : undefined);
}

const PERSON_JOBS = new Set(["Director", "Writer", "Screenplay", "Creator", "Novel"]);
const TALK_AND_NEWS = [10763, 10767];

/**
 * A person's best-known films and shows, whatever they did on them: TMDB
 * files Greta Gerwig under acting, but Barbie and Lady Bird are what people
 * search her for. Films they made count a little more than roles they played.
 */
export function bestKnownWork(credits: any): { work: any[]; role: string } {
  const acted = (credits?.cast ?? []).filter((credit: any) => !/\b(self|himself|herself|themselves)\b/i.test(credit.character || ""));
  const made = (credits?.crew ?? []).filter((credit: any) => PERSON_JOBS.has(credit.job));
  const usable = (credit: any) => credit.poster_path && (Number(credit.vote_count) || 0) >= 30
    && !(credit.genre_ids ?? []).some((genre: number) => TALK_AND_NEWS.includes(genre));

  const best = new Map<string, { credit: any; score: number; job: string }>();
  for (const [list, weight] of [[made, 1.5], [acted, 1]] as const) {
    for (const credit of list.filter(usable)) {
      const key = `${credit.media_type}:${credit.id}`;
      const score = (Number(credit.vote_count) || 0) * weight;
      if ((best.get(key)?.score ?? -1) < score) best.set(key, { credit, score, job: credit.job || "Acting" });
    }
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, 12).map((entry) => entry.job);
  const roles: string[] = [];
  if (top.includes("Director")) roles.push("Director");
  else if (top.includes("Creator")) roles.push("Creator");
  else if (top.some((job) => job !== "Acting")) roles.push("Writer");
  if (top.filter((job) => job === "Acting").length >= 2 || !roles.length) roles.push("Actor");

  return { work: ranked.map((entry) => entry.credit), role: roles.join(" & ") };
}

export interface Seed {
  tmdbId: string;
  tmdbType: "movie" | "tv";
  title: string;
}

/**
 * The saved titles to recommend from: the most recently saved or watched,
 * newest first, so the suggestions follow what you're into now.
 */
export function pickSeeds(movies: Movie[], limit = 6): Seed[] {
  return movies
    .filter((movie) => movie.tmdbId && (movie.tmdbType === "movie" || movie.tmdbType === "tv"))
    .map((movie) => ({ movie, at: Math.max(Number(movie.watchedAt) || 0, Number(movie.createdAt) || 0) }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ movie }) => ({
      tmdbId: String(movie.tmdbId),
      tmdbType: movie.tmdbType as "movie" | "tv",
      title: String(movie.title).replace(/\s*\((?:18|19|20)\d{2}\)\s*$/, "").trim()
    }));
}

/**
 * What you already have, as TMDB keys plus plain titles. The titles catch
 * hand-added saves and same-name versions (the UK and US "The Office"), which
 * would otherwise come back as "Because you saved The Office".
 */
export function savedKeys(movies: Movie[]): Set<string> {
  const keys = new Set<string>();
  for (const movie of movies) {
    if (movie.tmdbId) keys.add(`tmdb:${movie.tmdbType === "tv" ? "tv" : "movie"}:${movie.tmdbId}`);
    keys.add(`title:${normalizeQuery(String(movie.title).replace(/\s*\((?:18|19|20)\d{2}\)\s*$/, ""))}`);
  }
  return keys;
}

export interface Recommendation {
  item: any;
  type: "movie" | "tv";
  because: string;
}

/**
 * Blends TMDB's per-title recommendations into one list. A title suggested
 * by several of your saves, or near the top of one, ranks higher; titles
 * already in your list are left out. Each keeps the save that suggested it
 * most strongly, for a "Because you saved …" line.
 */
export function blendRecommendations(lists: { seed: Seed; results: any[] }[], exclude: Set<string>, limit = 30): Recommendation[] {
  const entries = new Map<string, { item: any; type: "movie" | "tv"; score: number; because: string; best: number }>();
  for (const { seed, results } of lists) {
    results.forEach((item, rank) => {
      if (!item?.poster_path) return;
      const type = item.media_type === "tv" || item.media_type === "movie" ? item.media_type : seed.tmdbType;
      const key = `tmdb:${type}:${item.id}`;
      if (exclude.has(key) || exclude.has(`title:${normalizeQuery(item.title || item.name || "")}`)) return;
      const weight = 1 / (1 + rank * 0.15);
      const entry = entries.get(key) ?? { item, type, score: 0, because: seed.title, best: 0 };
      entry.score += weight;
      if (weight > entry.best) {
        entry.best = weight;
        entry.because = seed.title;
      }
      entries.set(key, entry);
    });
  }
  return [...entries.values()]
    .map((entry) => ({ ...entry, score: entry.score + (Number(entry.item.vote_average) || 0) / 20 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item, type, because }) => ({ item, type, because }));
}
