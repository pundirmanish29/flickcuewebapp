// Title lookups, all through FlickCue's title service (the proxy that holds
// the shared key), the same way the extension and the Android app call it.

import { PROXY_BASE_URL } from "./config";
import { bestKnownWork, blendRecommendations, matchPerson, rankSearchResults, splitYear, type Seed } from "./discover";
import { isUnreleased } from "./rules";
import type { Candidate, Movie, Season } from "./types";

const IMAGE_BASE = "https://image.tmdb.org/t/p";
export class TmdbError extends Error {}

async function tmdbGet<T = any>(path: string, params: Record<string, string> = {}): Promise<T> {
  const search = new URLSearchParams({ language: "en-US", ...params });
  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE_URL}/tmdb/${path}?${search}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new TmdbError("Couldn't reach FlickCue's title service. Check your connection.");
  }
  if (response.status === 403) throw new TmdbError("FlickCue's title service isn't available on this site yet.");
  if (response.status === 429) throw new TmdbError("Too many lookups at once. Try again in a moment.");
  if (!response.ok) throw new TmdbError(`Title lookup failed (${response.status}). Try again in a moment.`);
  return response.json();
}

export const posterUrl = (path: string | null | undefined, size = "w342") => (path ? `${IMAGE_BASE}/${size}${path}` : "");

/** A bigger copy of a stored TMDB poster or backdrop, for large displays. */
export function upscale(url: string | undefined, size: string): string {
  if (!url) return "";
  return url.replace(/(image\.tmdb\.org\/t\/p\/)(w\d+|original)/, `$1${size}`);
}

function toCandidate(item: any, defaultType?: "movie" | "tv"): Candidate {
  const tmdbType = (item.media_type || defaultType) === "tv" ? "tv" : "movie";
  const name = item.title || item.name || "Untitled";
  const date = item.release_date || item.first_air_date || "";
  const year = /^\d{4}/.test(date) ? date.slice(0, 4) : "";
  const rating = Number(item.vote_average) || 0;
  const isDocumentary = Array.isArray(item.genre_ids) && item.genre_ids.includes(99);
  const candidate: Candidate = {
    key: `tmdb:${tmdbType}:${item.id}`,
    title: year ? `${name} (${year})` : name,
    year,
    mediaType: isDocumentary ? "Documentary" : tmdbType === "movie" ? "Movie" : "Show",
    tmdbType,
    tmdbId: String(item.id),
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    overview: item.overview || "",
    rating: rating > 0 ? rating.toFixed(1) : "",
    poster: posterUrl(item.poster_path, "w185"),
    backdrop: posterUrl(item.backdrop_path, "w780"),
    upcoming: false
  };
  candidate.upcoming = Boolean(date) && isUnreleased(candidate);
  return candidate;
}

function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((item) => (seen.has(item.key) ? false : (seen.add(item.key), true)));
}

export interface PersonMatch {
  name: string;
  role: string;
  photo: string;
  titles: Candidate[];
}

export interface SearchResult {
  titles: Candidate[];
  person?: PersonMatch;
}

const EMPTY = { results: [] as any[] };

export async function searchTitles(query: string): Promise<SearchResult> {
  const { text, year } = splitYear(query);
  const search = (value: string) => tmdbGet("search/multi", { query: value, include_adult: "false", page: "1" });
  // With a trailing year, search both ways: "dune 2021" finds nothing as
  // typed, while "Blade Runner 2049" needs its number.
  const [full, withoutYear] = await Promise.all([search(query.trim()), year ? search(text).catch(() => EMPTY) : Promise.resolve(EMPTY)]);
  const results = [...(withoutYear.results ?? []), ...(full.results ?? [])];

  const titles = dedupe(rankSearchResults(results, query).map((item) => toCandidate(item))).slice(0, 24);

  const found = matchPerson(results, query);
  if (!found) return { titles };
  const credits = await tmdbGet(`person/${found.id}/combined_credits`).catch(() => null);
  const { work: credited, role } = bestKnownWork(credits);
  const work = dedupe(credited.map((item: any) => toCandidate(item))).slice(0, 18);
  if (!work.length) return { titles };
  const person: PersonMatch = {
    name: found.name,
    role,
    photo: posterUrl(found.profile_path, "w185"),
    titles: work
  };
  // Their films lead; the title matches follow without repeating them.
  const shown = new Set(work.map((item) => item.key));
  return { person, titles: titles.filter((item) => !shown.has(item.key)) };
}

/** "For you": TMDB recommendations for your recent saves, blended into one list. */
export async function recommendFrom(seeds: Seed[], exclude: Set<string>): Promise<Candidate[]> {
  const lists = await Promise.all(seeds.map((seed) =>
    tmdbGet(`${seed.tmdbType}/${seed.tmdbId}/recommendations`, { page: "1" })
      .then((data) => ({ seed, results: data.results ?? [] }))
      .catch(() => ({ seed, results: [] as any[] }))
  ));
  if (lists.every((list) => !list.results.length)) {
    // Every lookup failed: surface why, rather than an empty "For you".
    await tmdbGet(`${seeds[0].tmdbType}/${seeds[0].tmdbId}/recommendations`, { page: "1" });
  }
  return blendRecommendations(lists, exclude).map(({ item, type, because }) => ({ ...toCandidate(item, type), reason: `Because you saved ${because}` }));
}

export interface DiscoverCategory {
  id: string;
  label: string;
  path: string;
  params?: Record<string, string>;
  type?: "movie" | "tv";
  /** Asked for the reader's region: what's in cinemas in India isn't what's in cinemas in the US. */
  regional?: boolean;
}

const FOUR_YEARS_AGO = `${new Date().getFullYear() - 4}-01-01`;

/** The Android app's Discover lists, plus a few for finding something good. */
export const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  { id: "trending", label: "Trending", path: "trending/all/week" },
  { id: "now-playing", label: "In cinemas", path: "movie/now_playing", type: "movie", regional: true },
  { id: "upcoming", label: "Coming soon", path: "movie/upcoming", type: "movie", regional: true },
  { id: "popular-films", label: "Popular films", path: "movie/popular", type: "movie" },
  { id: "top-films", label: "Top rated films", path: "movie/top_rated", type: "movie" },
  {
    id: "hidden-gems", label: "Hidden gems", path: "discover/movie", type: "movie",
    // Well rated but not blockbusters: 500-4,000 votes, fiction only (no documentaries,
    // concert films or TV movies), from the last few years.
    params: { sort_by: "vote_average.desc", "vote_count.gte": "500", "vote_count.lte": "4000", "vote_average.gte": "7.0", "primary_release_date.gte": FOUR_YEARS_AGO, without_genres: "99,10402,10770" }
  },
  { id: "popular-shows", label: "Popular shows", path: "tv/popular", type: "tv" },
  { id: "top-shows", label: "Top rated shows", path: "tv/top_rated", type: "tv" },
  ...([
    ["action", "Action", "28"], ["comedy", "Comedy", "35"], ["drama", "Drama", "18"], ["thriller", "Thriller", "53"],
    ["horror", "Horror", "27"], ["scifi", "Sci-Fi", "878"], ["animation", "Animation", "16"], ["romance", "Romance", "10749"]
  ] as const).map(([id, label, genre]) => ({
    id, label, path: "discover/movie", params: { with_genres: genre, sort_by: "popularity.desc", "vote_count.gte": "100" }, type: "movie" as const
  }))
];

export const IN_CINEMAS = DISCOVER_CATEGORIES.find((category) => category.id === "now-playing")!;

const cinemaLists = new Map<string, Promise<Set<string>>>();

/**
 * Keys ("tmdb:movie:<id>") of the films in cinemas in a region now, fetched
 * once per region per visit and shared by every page that asks.
 */
export function inCinemasNow(region: string): Promise<Set<string>> {
  const code = region.toUpperCase();
  let request = cinemaLists.get(code);
  if (!request) {
    request = Promise.all([browse(IN_CINEMAS, 1, code), browse(IN_CINEMAS, 2, code).catch(() => ({ items: [] as Candidate[] }))])
      .then((pages) => new Set(pages.flatMap((page) => page.items.map((item) => item.key))))
      .catch(() => {
        // A failed lookup is retried next time rather than remembered as "nothing on".
        cinemaLists.delete(code);
        return new Set<string>();
      });
    cinemaLists.set(code, request);
  }
  return request;
}

/** The key a saved film has in those lists. */
export const cinemaKey = (movie: { tmdbId?: string; tmdbType?: string }) =>
  movie.tmdbId && movie.tmdbType !== "tv" ? `tmdb:movie:${movie.tmdbId}` : "";

export async function browse(category: DiscoverCategory, page = 1, region = ""): Promise<{ items: Candidate[]; more: boolean }> {
  const params: Record<string, string> = { include_adult: "false", page: String(page), ...(category.params ?? {}) };
  if (category.regional && /^[A-Z]{2}$/i.test(region)) params.region = region.toUpperCase();
  const data = await tmdbGet(category.path, params);
  const items = dedupe((data.results ?? [])
    .filter((item: any) => item.poster_path && (category.type || item.media_type === "movie" || item.media_type === "tv"))
    .map((item: any) => toCandidate(item, category.type)))
    // The list itself is the news: say so on each card. (Its release_date is
    // the first release anywhere, not this region's, so no date is claimed.)
    .map((item) => (category.id === "now-playing" ? { ...item, reason: "In cinemas now" } : item));
  return { items, more: page < Math.min(Number(data.total_pages) || 1, 10) };
}

export interface Provider {
  name: string;
  logo: string;
}

export interface CastMember {
  name: string;
  character: string;
  photo: string;
}

export interface TitleDetails {
  overview: string;
  tagline: string;
  genres: string[];
  runtimeMinutes: number;
  status: string;
  imdbId: string;
  rating: string;
  backdrop: string;
  poster: string;
  releaseDate: string;
  director: string;
  cast: CastMember[];
  seasons: Season[];
  streaming: Provider[];
  rentOrBuy: Provider[];
  watchLink: string;
  trailer: string;
}

const detailsCache = new Map<string, Promise<TitleDetails>>();

function providers(list: any[] | undefined): Provider[] {
  return (list ?? []).slice(0, 8).map((provider) => ({ name: provider.provider_name, logo: posterUrl(provider.logo_path, "w92") }));
}

export function fetchDetails(movie: Pick<Movie, "tmdbId" | "tmdbType">, region: string): Promise<TitleDetails> {
  const type = movie.tmdbType === "tv" ? "tv" : "movie";
  const key = `${type}:${movie.tmdbId}:${region}`;
  const cached = detailsCache.get(key);
  if (cached) return cached;

  const request = tmdbGet(`${type}/${movie.tmdbId}`, { append_to_response: "credits,watch/providers,external_ids,videos" })
    .then((data): TitleDetails => {
      const where = data["watch/providers"]?.results?.[region.toUpperCase()] ?? {};
      const rentOrBuy = providers([...(where.rent ?? []), ...(where.buy ?? [])]);
      const trailer = (data.videos?.results ?? []).find((video: any) => video.site === "YouTube" && video.type === "Trailer");
      const rating = Number(data.vote_average) || 0;
      return {
        overview: data.overview || "",
        tagline: data.tagline || "",
        genres: (data.genres ?? []).map((genre: any) => genre.name),
        runtimeMinutes: Number(data.runtime || data.episode_run_time?.[0] || 0),
        status: data.status || "",
        imdbId: data.external_ids?.imdb_id || data.imdb_id || "",
        rating: rating > 0 ? rating.toFixed(1) : "",
        backdrop: posterUrl(data.backdrop_path, "w1280"),
        poster: posterUrl(data.poster_path, "w500"),
        releaseDate: data.release_date || data.first_air_date || "",
        director: type === "movie"
          ? (data.credits?.crew ?? []).find((person: any) => person.job === "Director")?.name || ""
          : (data.created_by ?? []).map((person: any) => person.name).slice(0, 2).join(", "),
        cast: (data.credits?.cast ?? []).slice(0, 10).map((person: any) => ({
          name: person.name, character: person.character || "", photo: posterUrl(person.profile_path, "w185")
        })),
        seasons: (data.seasons ?? [])
          .filter((season: any) => season.season_number > 0)
          .map((season: any) => ({
            number: season.season_number,
            name: season.name,
            year: String(season.air_date || "").slice(0, 4),
            episodes: season.episode_count || 0,
            rating: season.vote_average ? Number(season.vote_average).toFixed(1) : null,
            poster: posterUrl(season.poster_path, "w185")
          })),
        streaming: providers(where.flatrate),
        rentOrBuy: rentOrBuy.filter((item, index) => rentOrBuy.findIndex((other) => other.name === item.name) === index),
        watchLink: where.link || "",
        trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : ""
      };
    });

  detailsCache.set(key, request);
  request.catch(() => detailsCache.delete(key));
  return request;
}
