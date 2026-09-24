// TMDB lookups. With the reader's own key they go straight to TMDB (which
// allows cross-origin calls); otherwise through FlickCue's proxy, which holds
// the shared key, the same way the extension and the Android app call it.

import { PROXY_BASE_URL } from "./config";
import { isUnreleased } from "./rules";
import type { Candidate, Movie, Season } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const V3_KEY = /^[a-f0-9]{32}$/i;

let userKey = "";

export function setTmdbKey(key: string) {
  userKey = key.trim();
}

export class TmdbError extends Error {}

async function tmdbGet<T = any>(path: string, params: Record<string, string> = {}): Promise<T> {
  const search = new URLSearchParams({ language: "en-US", ...params });
  let url: string;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (userKey) {
    if (V3_KEY.test(userKey)) search.set("api_key", userKey);
    else headers.Authorization = `Bearer ${userKey}`;
    url = `${TMDB_BASE}/${path}?${search}`;
  } else {
    url = `${PROXY_BASE_URL}/tmdb/${path}?${search}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw new TmdbError(userKey
      ? "Couldn't reach TMDB. Check your connection."
      : "Couldn't reach FlickCue's title service. Add your own TMDB key in Settings, or check your connection.");
  }
  if (response.status === 401) throw new TmdbError("TMDB refused the key. Check it in Settings.");
  if (response.status === 403) throw new TmdbError("FlickCue's title service doesn't accept requests from this site yet. Add your own TMDB key in Settings.");
  if (response.status === 429) throw new TmdbError("Too many lookups at once. Try again in a moment.");
  if (!response.ok) throw new TmdbError(`TMDB lookup failed (${response.status}).`);
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

export async function searchTitles(query: string): Promise<Candidate[]> {
  const data = await tmdbGet("search/multi", { query, include_adult: "false", page: "1" });
  const wanted = query.trim().toLowerCase();
  return dedupe((data.results ?? [])
    .filter((item: any) => item.media_type === "movie" || item.media_type === "tv")
    .map((item: any) => toCandidate(item)))
    .sort((a, b) => Number(b.title.toLowerCase().startsWith(wanted)) - Number(a.title.toLowerCase().startsWith(wanted)))
    .slice(0, 24);
}

export interface DiscoverCategory {
  id: string;
  label: string;
  path: string;
  params?: Record<string, string>;
  type?: "movie" | "tv";
}

/** The Android app's Discover lists. */
export const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  { id: "trending", label: "Trending", path: "trending/all/week" },
  { id: "popular-films", label: "Popular films", path: "movie/popular", type: "movie" },
  { id: "top-films", label: "Top rated films", path: "movie/top_rated", type: "movie" },
  { id: "upcoming", label: "Coming soon", path: "movie/upcoming", type: "movie" },
  { id: "popular-shows", label: "Popular shows", path: "tv/popular", type: "tv" },
  { id: "top-shows", label: "Top rated shows", path: "tv/top_rated", type: "tv" },
  ...([
    ["action", "Action", "28"], ["comedy", "Comedy", "35"], ["drama", "Drama", "18"], ["thriller", "Thriller", "53"],
    ["horror", "Horror", "27"], ["scifi", "Sci-Fi", "878"], ["animation", "Animation", "16"], ["romance", "Romance", "10749"]
  ] as const).map(([id, label, genre]) => ({
    id, label, path: "discover/movie", params: { with_genres: genre, sort_by: "popularity.desc" }, type: "movie" as const
  }))
];

export async function browse(category: DiscoverCategory): Promise<Candidate[]> {
  const data = await tmdbGet(category.path, { include_adult: "false", page: "1", ...(category.params ?? {}) });
  return dedupe((data.results ?? [])
    .filter((item: any) => item.poster_path && (category.type || item.media_type === "movie" || item.media_type === "tv"))
    .map((item: any) => toCandidate(item, category.type)))
    .slice(0, 30);
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
