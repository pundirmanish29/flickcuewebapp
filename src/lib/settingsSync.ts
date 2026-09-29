// Settings that follow the reader between devices, kept in Drive beside the
// list (flickcue-settings.json). Notifications stay per device: each browser
// grants them separately.

import { letterboxdHandle } from "./letterboxd";
import type { ThemeChoice } from "./theme";
import type { SortMode } from "./types";

const SORTS: SortMode[] = ["added", "reminder", "title", "rating", "shortest"];

export interface SyncedSettings {
  region: string;
  city: string;
  letterboxd: string;
  letterboxdUnlinked: boolean;
  theme: ThemeChoice;
  /** The Queue's sort. */
  sort: SortMode;
  /** TMDB language for titles and overviews. */
  language: string;
}

export const SYNCED_KEYS = ["region", "city", "letterboxd", "letterboxdUnlinked", "theme", "sort", "language"] as const;

/** Only well-formed values are taken from Drive; anything else keeps this device's. */
export function readSynced(raw: Record<string, unknown>, fallback: SyncedSettings): SyncedSettings {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);
  const region = text(raw.region, 2);
  const theme = raw.theme === "light" || raw.theme === "dark" || raw.theme === "system" ? raw.theme : null;
  return {
    region: region && /^[A-Z]{2}$/.test(region) ? region : fallback.region,
    city: text(raw.city, 60) ?? fallback.city,
    letterboxd: typeof raw.letterboxd === "string" ? letterboxdHandle(raw.letterboxd) : fallback.letterboxd,
    letterboxdUnlinked: typeof raw.letterboxdUnlinked === "boolean" ? raw.letterboxdUnlinked : fallback.letterboxdUnlinked,
    theme: theme ?? fallback.theme,
    sort: SORTS.includes(raw.sort as SortMode) ? (raw.sort as SortMode) : fallback.sort,
    language: typeof raw.language === "string" && /^[a-z]{2}-[A-Z]{2}$/.test(raw.language) ? raw.language : fallback.language
  };
}

/**
 * The newer side wins, as a whole: "pull" takes Drive's, "push" writes this
 * device's, "none" when they already agree. A device that has never changed
 * a setting (updatedAt 0) takes whatever Drive has.
 */
export function settingsDirection(localAt: number, remote: { updatedAt: number } | null): "pull" | "push" | "none" {
  if (!remote) return "push";
  if (remote.updatedAt > localAt) return "pull";
  if (localAt > remote.updatedAt) return "push";
  return "none";
}
