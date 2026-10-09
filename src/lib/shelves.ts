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

/** On a streaming service: "New on Netflix" when recent, else nothing (the card shows its summary). */
export function providerReason(item: Candidate, provider: string, now = Date.now()): string {
  const age = daysSinceRelease(item.releaseDate, now);
  return age !== null && age >= 0 && age <= 120 ? `New on ${provider}` : "";
}

const category = (id: string) => DISCOVER_CATEGORIES.find((item) => item.id === id)!;

/** What everyone's looking at today, labelled by why. Its "See all" is the Trending list. */
export const TALK_OF_THE_TOWN: DiscoverCategory = {
  id: "talk-of-the-town", label: "Talk of the town", path: "trending/all/day", reason: (item) => talkOfTheTownReason(item)
};
export const TALK_SEE_ALL = "trending";

export const COMING_SOON: DiscoverCategory = { ...category("upcoming"), reason: comingSoonReason };
export const HIDDEN_GEMS: DiscoverCategory = { ...category("hidden-gems"), reason: hiddenGemReason };

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

const twoYearsAgo = () => `${new Date().getFullYear() - 2}-01-01`;

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

/** One page of a streaming choice, films and shows or just one kind: the list behind its chip. */
export function browseStream(choice: StreamChoice, region: string, kind: "all" | "movie" | "tv", page = 1): Promise<{ items: Candidate[]; more: boolean }> {
  if (choice.id === "free") {
    return mixed("free", "Free to watch", {
      watch_region: region, with_watch_monetization_types: "free|ads",
      sort_by: "popularity.desc", "vote_count.gte": "200", "vote_average.gte": "6.5"
    }, null, () => "Free to watch", kind, page);
  }
  return mixed(choice.id, choice.label, {
    with_watch_providers: choice.id, watch_region: region, with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc", "vote_count.gte": "100", "vote_average.gte": "6.5"
  }, twoYearsAgo(), (item) => providerReason(item, choice.label), kind, page);
}
