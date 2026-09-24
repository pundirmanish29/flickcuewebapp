// Ports of the extension's shared rules (shared.js and list-shared.js). The
// Drive file is shared with the extension and the Android app, so all three
// have to read and write titles the same way.

import type { KindFilter, Movie, SortMode } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REMINDER_HOUR = 20;
const DAY = 24 * 60 * 60 * 1000;

export function normalizeTitle(title: unknown): string {
  return String(title ?? "")
    .toLowerCase()
    .replace(/\(\d{4}\)/g, "")
    .replace(/\btv mini series\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Keeps remakes and same-name films/series apart during merges. */
export function movieDedupKey(movie: Movie): string {
  const year = movie.year || String(movie.title).match(/\((\d{4})\)/)?.[1] || "";
  const kind = movie.tmdbType || (movie.mediaType === "Show" ? "tv" : movie.mediaType ? "movie" : "");
  return `${normalizeTitle(movie.title)}|${year}|${kind}`;
}

/** The title without its "(2024)" suffix, for display next to a separate year. */
export function displayTitle(movie: Pick<Movie, "title">): string {
  return String(movie.title).replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim() || String(movie.title);
}

export function localIsoDate(time = Date.now()): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The release date is the fact; the stored `upcoming` flag is only a fallback. */
export function isUnreleased(movie: Pick<Movie, "releaseDate" | "upcoming">, now = Date.now()): boolean {
  if (ISO_DATE.test(movie.releaseDate || "")) {
    return (movie.releaseDate as string) > new Date(now).toISOString().slice(0, 10);
  }
  return Boolean(movie.upcoming);
}

export function isShow(movie: Pick<Movie, "tmdbType" | "mediaType">): boolean {
  return movie.tmdbType ? movie.tmdbType === "tv" : movie.mediaType === "Show";
}

export function hasActiveReminder(movie: Movie, now = Date.now()): boolean {
  return Number(movie.remindAt ?? 0) > now;
}

/** A reminder that has passed, or lands before tonight is out, needs attention now. */
export function isDueNow(movie: Movie, now = Date.now()): boolean {
  if (movie.watched || !movie.remindAt) return false;
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return movie.remindAt <= endOfDay.getTime();
}

// Reminder presets, matching the Android app's MovieRules.
export function tonightReminder(now = Date.now()): number {
  const date = new Date(now);
  date.setHours(REMINDER_HOUR, 0, 0, 0);
  return date.getTime() > now ? date.getTime() : now + 60 * 60 * 1000;
}

export function tomorrowReminder(now = Date.now()): number {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(REMINDER_HOUR, 0, 0, 0);
  return date.getTime();
}

export function weekendReminder(now = Date.now()): number {
  const date = new Date(now);
  date.setHours(10, 0, 0, 0);
  while (date.getDay() !== 6 || date.getTime() <= now) {
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
  }
  return date.getTime();
}

/** Release day at 8 PM local time, or null when there's no date or it has passed. */
export function releaseDayReminder(releaseDate: string | undefined, now = Date.now()): number | null {
  if (!ISO_DATE.test(releaseDate || "")) return null;
  const reminder = new Date(`${releaseDate}T00:00:00`);
  reminder.setHours(REMINDER_HOUR, 0, 0, 0);
  return reminder.getTime() > now ? reminder.getTime() : null;
}

/** What "Snooze" sets: release day for an unreleased title, tomorrow otherwise. */
export function nextReminder(movie: Movie, now = Date.now()): number {
  const releaseDay = isUnreleased(movie, now) ? releaseDayReminder(movie.releaseDate, now) : null;
  return releaseDay ?? tomorrowReminder(now);
}

// ---- Sorting and filtering (list-shared.js) ----

function reminderRank(movie: Movie, now: number): number {
  if (!movie.remindAt) return Number.POSITIVE_INFINITY;
  return movie.remindAt > now ? movie.remindAt : now - 1;
}

const created = (movie: Movie) => Number(movie.createdAt ?? 0);

export function sortMovies(movies: Movie[], mode: SortMode, watchedView = false, now = Date.now()): Movie[] {
  const list = [...movies];

  // Watched is a history, so it always reads newest-finished first.
  if (watchedView) {
    return list.sort((a, b) => Number(b.watchedAt ?? b.createdAt ?? 0) - Number(a.watchedAt ?? a.createdAt ?? 0));
  }
  switch (mode) {
    case "reminder":
      return list.sort((a, b) => reminderRank(a, now) - reminderRank(b, now) || created(b) - created(a));
    case "title":
      return list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    case "rating":
      return list.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0) || created(b) - created(a));
    case "shortest":
      // An unknown length is not a promise of a short one, so those go last.
      return list.sort((a, b) =>
        (Number(a.runtimeMinutes) || Infinity) - (Number(b.runtimeMinutes) || Infinity) || created(b) - created(a));
    default:
      return list.sort((a, b) => created(b) - created(a));
  }
}

export function matchesKind(movie: Movie, kind: KindFilter): boolean {
  if (kind === "all") return true;
  return kind === "tv" ? isShow(movie) : !isShow(movie);
}

export function matchesSearch(movie: Movie, query: string): boolean {
  const wanted = normalizeTitle(query);
  return !wanted || normalizeTitle(movie.title).includes(wanted);
}

// ---- Wording ----

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatRelativeDay(value: number, now = Date.now()): string {
  const date = new Date(value);
  const today = new Date(now);
  const yesterday = new Date(now - DAY);
  if (isSameDay(date, today)) return "today";
  if (isSameDay(date, yesterday)) return "yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function formatReminder(value: number, now = Date.now()): string {
  const date = new Date(value);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (value <= now) return "due now";
  if (isSameDay(date, new Date(now))) return `today ${time}`;
  if (isSameDay(date, new Date(now + DAY))) return `tomorrow ${time}`;
  if (value - now < 6 * DAY) return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

export function reminderText(movie: Movie, now = Date.now()): string {
  if (movie.watched) return movie.watchedAt ? `Watched ${formatRelativeDay(movie.watchedAt, now)}` : "Watched";
  if (isUnreleased(movie, now)) {
    const release = ISO_DATE.test(movie.releaseDate || "")
      ? new Date(`${movie.releaseDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "";
    return release ? `Releasing ${release}` : "Not yet released";
  }
  if (!movie.remindAt) return "No reminder";
  return `Remind ${formatReminder(movie.remindAt, now)}`;
}

export function formatRuntime(minutes?: number): string {
  const total = Number(minutes) || 0;
  if (!total) return "";
  const hours = Math.floor(total / 60);
  return hours ? `${hours}h ${total % 60 ? `${total % 60}m` : ""}`.trim() : `${total}m`;
}

/** Episodes ticked off (stored as "season:episode"), counted per season. */
export function seasonProgress(movie: Movie) {
  const marked = new Set(movie.personal?.episodes || []);
  return (movie.seasons || [])
    .filter((season) => season.number > 0 && Number(season.episodes) > 0)
    .map((season) => {
      const total = Math.min(Number(season.episodes), 1000);
      let seen = 0;
      for (let episode = 1; episode <= total; episode++) if (marked.has(`${season.number}:${episode}`)) seen++;
      return { number: season.number, name: season.name, seen, total };
    });
}

/** Two letters for a poster that has no artwork. */
export function titleInitials(title: string): string {
  const words = displayTitle({ title }).split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

const PLACEHOLDER_TINTS = ["#64d48a", "#ff8c45", "#55a9ff", "#d7ff86", "#ff7a66"];

export function placeholderTint(title: string): string {
  let hash = 0;
  for (const char of String(title)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PLACEHOLDER_TINTS[Math.abs(hash) % PLACEHOLDER_TINTS.length];
}

// ---- Show status (shared.js getShowStatus) ----

export interface ShowStatus {
  kind: "premiere" | "season" | "airing" | "new-episode" | "ended" | "returning";
  tone: "amber" | "green" | "neutral";
  text: string;
  badge: string;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY);
}

function formatAirDate(date: string, now = Date.now(), short = false): string {
  const days = daysBetween(localIsoDate(now), date);
  let text: string;
  if (days === 0) text = "today";
  else if (days === 1) text = "tomorrow";
  else {
    const value = new Date(`${date}T00:00:00`);
    const options: Intl.DateTimeFormatOptions = days > 1 && days < 7 ? { weekday: "short" }
      : value.getFullYear() === new Date(now).getFullYear() || days < 120 ? { month: "short", day: "numeric" }
      : { month: "short", year: "numeric" };
    text = value.toLocaleDateString(undefined, options);
  }
  return short ? text.toUpperCase() : text;
}

export function getShowStatus(movie: Movie, now = Date.now()): ShowStatus | null {
  if (!isShow(movie)) return null;
  const schedule = movie.showSchedule;
  const today = localIsoDate(now);
  const premiere = schedule?.firstAirDate || movie.releaseDate || "";

  if (premiere > today || (!premiere && !schedule && isUnreleased(movie, now))) {
    return premiere
      ? { kind: "premiere", tone: "amber", text: `Premieres ${formatAirDate(premiere, now)}`, badge: formatAirDate(premiere, now, true) }
      : { kind: "premiere", tone: "amber", text: "Premiere date to be announced", badge: "SOON" };
  }

  const next = schedule?.next && schedule.next.date >= today ? schedule.next : null;
  if (next) {
    const when = formatAirDate(next.date, now);
    if (next.episode === 1 && next.season > 1) {
      return { kind: "season", tone: "amber", text: `Season ${next.season} · ${when}`, badge: `S${next.season} · ${formatAirDate(next.date, now, true)}` };
    }
    return next.finale
      ? { kind: "airing", tone: "green", text: `Finale · ${when}`, badge: "FINALE" }
      : { kind: "airing", tone: "green", text: `New episodes · next ${when}`, badge: "AIRING" };
  }

  const last = schedule?.last;
  if (last?.date && last.date <= today && daysBetween(last.date, today) <= 7) {
    return last.finale && last.season
      ? { kind: "new-episode", tone: "green", text: `Season ${last.season} finale out`, badge: "NEW EP" }
      : { kind: "new-episode", tone: "green", text: "New episode out", badge: "NEW EP" };
  }

  const seasons = schedule?.seasons ? ` · ${schedule.seasons} season${schedule.seasons === 1 ? "" : "s"}` : "";
  if (/^ended$/i.test(schedule?.status ?? "")) return { kind: "ended", tone: "neutral", text: `Ended${seasons}`, badge: "ENDED" };
  if (/^canceled$/i.test(schedule?.status ?? "")) return { kind: "ended", tone: "neutral", text: `Canceled${seasons}`, badge: "CANCELED" };
  if (/^returning series$/i.test(schedule?.status ?? "")) return { kind: "returning", tone: "neutral", text: "Returning · no date yet", badge: "" };
  return null;
}

/** The corner badge on a grid tile: what needs attention first. */
export function gridBadge(movie: Movie, now = Date.now()): { text: string; tone: "due" | "amber" | "green" | "neutral" } | null {
  if (movie.watched) return null;
  if (isDueNow(movie, now)) return { text: movie.remindAt! <= now ? "DUE" : "TONIGHT", tone: "due" };
  const status = getShowStatus(movie, now);
  if (status?.badge) return { text: status.badge, tone: status.tone };
  if (isUnreleased(movie, now)) return { text: "SOON", tone: "amber" };
  return null;
}
