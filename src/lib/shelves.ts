// Curated Discover shelves: each says why a title is there, in a few words
// under its name ("New Movie", "Releases Oct 3", "New on Netflix").

import { browse, DISCOVER_CATEGORIES, type DiscoverCategory } from "./tmdb";
import type { Candidate } from "./types";

const DAY = 24 * 60 * 60 * 1000;

const isoToday = (now: number) => {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/** Whole days since a release date (negative before it), or null without a real date. */
export function daysSinceRelease(iso: string, now = Date.now()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const today = new Date(`${isoToday(now)}T12:00:00Z`).getTime();
  return Math.round((today - new Date(`${iso}T12:00:00Z`).getTime()) / DAY);
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Talk of the town": what's new, what's about to be, or simply what everyone's watching. */
export function talkOfTheTownReason(item: Candidate, now = Date.now()): string {
  const age = daysSinceRelease(item.releaseDate, now);
  if (age !== null && age < 0) return `Releases ${shortDate(item.releaseDate)}`;
  if (age !== null && item.tmdbType === "movie" && age <= 60) return "New Movie";
  if (age !== null && item.tmdbType === "tv" && age <= 150) return "New Show";
  return item.tmdbType === "tv" ? "Trending Show" : "Trending Movie";
}

export function comingSoonReason(item: Candidate): string {
  return item.releaseDate ? `Releases ${shortDate(item.releaseDate)}` : "Date to be announced";
}

export function hiddenGemReason(item: Candidate): string {
  return item.rating ? `Hidden gem · rated ${item.rating}` : "Hidden gem";
}

const STREAM_NEW_DAYS = 90;

/** Release age describes a new title, not the date it joined a provider's catalogue. */
export function providerReason(item: Candidate, provider: string, now = Date.now()): string {
  const age = daysSinceRelease(item.releaseDate, now);
  return age !== null && age >= 0 && age <= STREAM_NEW_DAYS ? `New ${item.tmdbType === "tv" ? "Show" : "Movie"} · ${provider}` : "";
}

const category = (id: string) => DISCOVER_CATEGORIES.find((item) => item.id === id)!;

/** What everyone's looking at today, labelled by why. Its "See all" is the Trending list. */
export const TALK_OF_THE_TOWN: DiscoverCategory = {
  id: "talk-of-the-town", label: "Talk of the town", path: "trending/all/day", reason: (item) => talkOfTheTownReason(item)
};
export const TALK_SEE_ALL = "trending";

export const COMING_SOON: DiscoverCategory = { ...category("upcoming"), reason: comingSoonReason };
export const HIDDEN_GEMS: DiscoverCategory = { ...category("hidden-gems"), reason: hiddenGemReason };

/** Homepage picks only; See all continues to use the unfiltered catalogue. */
export function featuredCinemaItems(items: readonly Candidate[], mode: "soon" | "now" | "new", now = Date.now()): Candidate[] {
  const ranked = items.filter((item) => {
    if (!item.poster) return false;
    const popularity = item.popularity ?? 0;
    // Unreleased films cannot be judged by votes. Keep a modest interest floor for regional releases.
    if (mode === "soon") return popularity >= 3;
    if (popularity < 10) return false;
    const age = daysSinceRelease(item.releaseDate, now);
    const established = (item.voteCount ?? 0) >= (item.tmdbType === "tv" ? 20 : 50);
    const freshInterest = age !== null && age >= 0 && age <= 14 && popularity >= 30;
    return established || freshInterest;
  }).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || (b.voteCount ?? 0) - (a.voteCount ?? 0));

  if (mode === "soon") {
    return ranked.slice(0, 12).sort((a, b) => (a.releaseDate || "9999-99-99").localeCompare(b.releaseDate || "9999-99-99"));
  }
  if (mode === "new") {
    // Preserve the movies-and-shows mix, ranking each kind by audience interest.
    const movies = ranked.filter((item) => item.tmdbType === "movie");
    const shows = ranked.filter((item) => item.tmdbType === "tv");
    const mixed: Candidate[] = [];
    for (let index = 0; index < Math.max(movies.length, shows.length); index++) {
      if (movies[index]) mixed.push(movies[index]);
      if (shows[index]) mixed.push(shows[index]);
    }
    return mixed.slice(0, 12);
  }
  return ranked.slice(0, 12);
}

/** TMDB's watch-provider ids; the Indian catalogue has JioHotstar where others have Disney+. */
export function providersFor(region: string): { id: string; name: string }[] {
  return [
    { id: "8", name: "Netflix" },
    { id: "119", name: "Prime Video" },
    region === "IN" ? { id: "2336", name: "JioHotstar" } : { id: "337", name: "Disney+" },
    { id: "350", name: "Apple TV" }
  ];
}

/** Films and shows from one discover query, taken in turn so a list isn't all of one kind. */
async function mixed(
  id: string, label: string, params: Record<string, string>, since: string | null, reason: (item: Candidate) => string,
  kind: "all" | "movie" | "tv" = "all", page = 1, until: string | null = null
): Promise<{ items: Candidate[]; more: boolean }> {
  const types = kind === "all" ? (["movie", "tv"] as const) : ([kind] as const);
  // One kind failing still leaves the other's titles; only when every request fails is that an error to report
  // (an empty list would read as "nothing on this service").
  let failure: unknown = null;
  let failed = 0;
  const results = await Promise.all(
    types.map((type) =>
      browse({
        id: `${id}-${type}`, label, path: `discover/${type}`, type,
        params: {
          ...params,
          ...(since ? { [type === "tv" ? "first_air_date.gte" : "primary_release_date.gte"]: since } : {}),
          ...(until ? { [type === "tv" ? "first_air_date.lte" : "primary_release_date.lte"]: until } : {})
        },
        reason
      }, page).catch((error) => {
        failed++;
        failure = error;
        return { items: [] as Candidate[], more: false };
      })
    )
  );
  if (failed === types.length) throw failure;
  const items: Candidate[] = [];
  for (let index = 0; index < Math.max(...results.map((result) => result.items.length)); index++) {
    for (const result of results) if (result.items[index]) items.push(result.items[index]);
  }
  return { items, more: results.some((result) => result.more) };
}

/** Discover's list of what has just come out: films and shows that first reached viewers in the last 30 days. */
export const NEW_RELEASES_ID = "new";
export const NEW_RELEASES_TITLE = "New movies and shows";

/** One page of it, popular first, films and shows taken in turn (or just one kind). */
export function browseNew(kind: "all" | "movie" | "tv" = "all", page = 1, now = Date.now()): Promise<{ items: Candidate[]; more: boolean }> {
  return mixed(
    NEW_RELEASES_ID, NEW_RELEASES_TITLE, { sort_by: "popularity.desc" }, isoToday(now - 30 * DAY),
    (item) => (item.tmdbType === "tv" ? "New Show" : "New Movie"), kind, page, isoToday(now)
  );
}

/** A streaming chip on Discover: what's free, or what's on one service. */
export interface StreamChoice {
  /** "free" or a watch-provider id. */
  id: string;
  label: string;
}

export const FREE_CHOICE: StreamChoice = { id: "free", label: "Free" };

export function streamChoices(region: string): StreamChoice[] {
  return [FREE_CHOICE, ...providersFor(region).map((provider) => ({ id: provider.id, label: provider.name }))];
}

/** New releases plus weekly TMDB trends, always restricted to regional streaming availability. */
export async function browseStream(choice: StreamChoice, region: string, kind: "all" | "movie" | "tv", page = 1, now = Date.now()): Promise<{ items: Candidate[]; more: boolean }> {
  const provider = choice.id === "free" ? "Free to watch" : choice.label;
  const params: Record<string, string> = {
    watch_region: region, sort_by: "popularity.desc",
    with_watch_monetization_types: choice.id === "free" ? "free|ads" : "flatrate",
    ...(choice.id === "free" ? {} : { with_watch_providers: choice.id })
  };
  const released = (item: Candidate) => {
    const age = daysSinceRelease(item.releaseDate, now);
    return age !== null && age >= 0;
  };
  const newReason = (item: Candidate) => providerReason(item, provider, now);
  const [recent, trending] = await Promise.allSettled([
    // No vote/rating floor: a new film or show may not have collected votes yet.
    mixed(choice.id, choice.label, params, isoToday(now - STREAM_NEW_DAYS * DAY), newReason, kind, page, isoToday(now))
      .then(result => ({ ...result, items: result.items.filter(item => released(item) && newReason(item)) })),
    (async () => {
      const [catalogue, trends] = await Promise.all([
        mixed(choice.id, choice.label, params, null, () => "", kind, page, isoToday(now)),
        Promise.all([1, 2, 3].map(trendPage => browse({
          id: "stream-weekly-trends", label: "Trending this week", path: `trending/${kind}/week`,
          ...(kind === "all" ? {} : { type: kind })
        }, trendPage)))
      ]);
      const keys = new Set(trends.flatMap(result => result.items.map(item => item.key)));
      return { ...catalogue, items: catalogue.items.filter(item => released(item) && keys.has(item.key)).map(item => ({
        ...item, reason: newReason(item) || `Trending ${item.tmdbType === "tv" ? "Show" : "Movie"} · ${provider}`
      })) };
    })()
  ]);
  if (recent.status === "rejected" && trending.status === "rejected") throw recent.reason;
  const fresh = recent.status === "fulfilled" ? recent.value : { items: [], more: false };
  const current = trending.status === "fulfilled" ? trending.value : { items: [], more: false };
  const items: Candidate[] = [];
  const seen = new Set<string>();
  // Both sources get space in the row; mixed() already alternates movies and shows.
  for (let index = 0; index < Math.max(fresh.items.length, current.items.length); index++) {
    for (const item of [fresh.items[index], current.items[index]]) {
      if (item && !seen.has(item.key)) { seen.add(item.key); items.push(item); }
    }
  }
  return { items, more: fresh.more || current.more };
}
