// Notifications are worked out from the list itself, the way the badges and
// "On your radar" are: nothing is sent or stored except when the reader last
// looked, so every device shows the same ones for the same list.

import { displayTitle, getShowSchedule, isBookingReminder, isShow, isStartedShow, localIsoDate, showEndsAt, watchedPromptDue } from "./rules";
import { cinemaKey } from "./tmdb";
import type { Movie } from "./types";

const DAY = 24 * 60 * 60 * 1000;
// How far back a release or episode is still news.
const RELEASE_WINDOW = 14 * DAY;
const EPISODE_WINDOW = 7 * DAY;
const LIMIT = 60;
// A reminder overdue longer than this leaves the list; the title stays due in the queue.
const REMINDER_WINDOW = 14 * DAY;
const SEEN_KEY = "flickcue.notificationsSeenAt";
const CINEMA_SEEN_KEY = "flickcue.cinemaSeenAt";
const EPISODE_SEEN_KEY = "flickcue.episodeSeenAt";

/** Which saved films are in cinemas, when each was first seen there, and where. */
export interface CinemaState {
  keys: Set<string>;
  firstSeen: Record<string, number>;
  place: string;
}

export type NotificationKind = "reminder" | "ticket" | "release" | "cinema" | "premiere" | "episode" | "season" | "finale";

export interface FlickNotification {
  /** Stable across loads, so an item keeps its place and read state. */
  id: string;
  movieId: string;
  kind: NotificationKind;
  /** When it happened: the reminder time, or midnight on the release or air date. */
  at: number;
  /** The whole sentence, for a browser alert: "New episode of Slow Horses streams today". */
  text: string;
  /** For the list, title first: the title, then what happened ("New episode today"). */
  title: string;
  event: string;
  detail: string;
  /** For an episode dated from when it was first seen: the air date, to show. */
  airedAt?: number;
}

/** Midnight local time on an ISO date, or NaN when it isn't one. */
function dayStart(iso: string | undefined): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? new Date(`${iso}T00:00:00`).getTime() : NaN;
}

const recent = (at: number, window: number, now: number) => Number.isFinite(at) && at <= now && now - at <= window;

export function buildNotifications(movies: Movie[], now = Date.now(), cinema?: CinemaState): FlickNotification[] {
  const items: FlickNotification[] = [];
  const today = localIsoDate(now);
  for (const movie of movies) {
    const title = displayTitle(movie);
    // A show marked watched that's still running is one being followed: its
    // new episodes are news, nothing else about it is.
    const following = Boolean(movie.watched) && isStartedShow(movie) && !/^(ended|canceled)$/i.test(getShowSchedule(movie)?.status ?? "");
    if (movie.watched && !following) continue;
    if (following) {
      episodeNews(movie, title, today, now, NaN, items);
      continue;
    }

    const remindAt = Number(movie.remindAt);
    if (remindAt > 0 && remindAt <= now && now - remindAt <= REMINDER_WINDOW) {
      const booked = isBookingReminder(movie) ? movie.booking! : null;
      const starts = booked ? new Date(booked.showAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
      items.push({
        id: `reminder:${movie.id}:${remindAt}`, movieId: movie.id, kind: "reminder", at: remindAt,
        text: booked ? `${title} starts at ${starts}${booked.cinema ? ` at ${booked.cinema}` : ""}` : `Time to watch ${title}`,
        title, event: booked ? `Starts at ${starts}` : "Reminder due", detail: booked?.cinema ?? ""
      });
    }

    // After a booked show: did they go?
    if (watchedPromptDue(movie, now)) {
      const at = showEndsAt(movie);
      items.push({
        id: `ticket:${movie.id}:${movie.booking!.showAt}`, movieId: movie.id, kind: "ticket", at,
        text: `Did you watch ${title}?`, title, event: "Did you watch it?", detail: movie.booking!.cinema ?? ""
      });
    }

    if (!isShow(movie)) {
      // In cinemas where the reader is says more than "released" somewhere.
      const key = cinemaKey(movie);
      if (cinema && key && cinema.keys.has(key)) {
        items.push({
          id: `cinema:${movie.id}`, movieId: movie.id, kind: "cinema", at: cinema.firstSeen[key] || now,
          text: `${title} is in cinemas`, title, event: "In cinemas", detail: `Showing in ${cinema.place}`
        });
        continue;
      }
      const released = dayStart(movie.releaseDate);
      if (recent(released, RELEASE_WINDOW, now)) {
        items.push({
          id: `release:${movie.id}:${movie.releaseDate}`, movieId: movie.id, kind: "release", at: released,
          text: `${title} is out now`, title, event: released >= dayStart(localIsoDate(now)) ? "Out today" : "Out now", detail: ""
        });
      }
      continue;
    }

    const schedule = getShowSchedule(movie);
    const premiere = dayStart(schedule?.firstAirDate || movie.releaseDate);
    if (recent(premiere, RELEASE_WINDOW, now)) {
      items.push({
        id: `premiere:${movie.id}`, movieId: movie.id, kind: "premiere", at: premiere,
        text: `${title} has premiered`, title, event: "Premiered", detail: "The first episode is out"
      });
    }
    episodeNews(movie, title, today, now, premiere, items);
  }
  // Today's episode and, once it has aired, the same one as the latest share an id.
  const unique = new Map<string, FlickNotification>();
  for (const item of items) if (!unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => b.at - a.at).slice(0, LIMIT);
}

type Air = { season: number; episode: number; finale?: boolean };

function episodeKind(air: Air): NotificationKind {
  return air.finale ? "finale" : air.episode === 1 && air.season > 1 ? "season" : "episode";
}

/** An episode airing today, and the latest one to have aired this week. */
function episodeNews(movie: Movie, title: string, today: string, now: number, premiere: number, items: FlickNotification[]) {
  const schedule = getShowSchedule(movie);
  const next = schedule?.next;
  if (next && next.date === today) {
    const kind = episodeKind(next);
    items.push({
      id: `episode:${movie.id}:S${next.season}E${next.episode}`, movieId: movie.id, kind, at: dayStart(today),
      text: kind === "finale" ? `The season ${next.season} finale of ${title} streams today`
        : kind === "season" ? `Season ${next.season} of ${title} starts today`
        : `New episode of ${title} streams today`,
      title,
      event: kind === "finale" ? `Season ${next.season} finale today` : kind === "season" ? `Season ${next.season} starts today` : "New episode today",
      detail: `S${next.season} · E${next.episode}`
    });
  }
  const last = schedule?.last;
  const aired = dayStart(last?.date);
  // A premiere already covers its own first episode.
  if (last && recent(aired, EPISODE_WINDOW, now) && aired !== premiere) {
    const kind = episodeKind(last);
    items.push({
      id: `episode:${movie.id}:S${last.season}E${last.episode}`, movieId: movie.id, kind, at: aired,
      text: kind === "finale" ? `The season ${last.season} finale of ${title} is out`
        : kind === "season" ? `Season ${last.season} of ${title} is here`
        : `New episode of ${title}`,
      title,
      event: kind === "finale" ? `Season ${last.season} finale` : kind === "season" ? `Season ${last.season} is here` : "New episode",
      detail: `S${last.season} · E${last.episode}`
    });
  }
}

export function getSeenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function markSeen(now = Date.now()) {
  try {
    localStorage.setItem(SEEN_KEY, String(now));
  } catch {
    // Without storage every visit shows them as new, which is harmless.
  }
  window.dispatchEvent(new Event("flickcue:notifications-seen"));
}

/**
 * When each saved film was first seen in cinemas here, so its notification
 * keeps one time (and read state) across visits. Films that left cinemas drop out.
 */
export function cinemaFirstSeen(movies: Movie[], inCinemas: Set<string>, now = Date.now()): Record<string, number> {
  let stored: Record<string, number> = {};
  try {
    stored = JSON.parse(localStorage.getItem(CINEMA_SEEN_KEY) || "{}");
  } catch {
    // Unreadable: start over, which only marks them new once more.
  }
  const next: Record<string, number> = {};
  for (const movie of movies) {
    const key = cinemaKey(movie);
    if (key && !movie.watched && inCinemas.has(key)) next[key] = Number(stored[key]) || now;
  }
  try {
    localStorage.setItem(CINEMA_SEEN_KEY, JSON.stringify(next));
  } catch {
    // Without storage the time is kept for this visit only.
  }
  return next;
}

/**
 * An episode is often learned of after its air date (when the schedule is
 * looked up), so it's dated from when this device first saw it: news found
 * after the reader last looked still counts as new.
 */
export function stampEpisodes(items: FlickNotification[], now = Date.now()): FlickNotification[] {
  let stored: Record<string, number> = {};
  // The first time round, what's already there keeps its own date rather than all turning new at once.
  let first = true;
  try {
    const raw = localStorage.getItem(EPISODE_SEEN_KEY);
    first = raw === null;
    stored = JSON.parse(raw || "{}");
  } catch {
    // Unreadable: start over.
  }
  const next: Record<string, number> = {};
  const stamped = items.map((item) => {
    if (item.kind !== "episode" && item.kind !== "season" && item.kind !== "finale") return item;
    const seen = Number(stored[item.id]) || (first ? item.at : now);
    next[item.id] = seen;
    return seen > item.at ? { ...item, at: seen, airedAt: item.at } : item;
  });
  try {
    localStorage.setItem(EPISODE_SEEN_KEY, JSON.stringify(next));
  } catch {
    // Without storage the time is kept for this visit only.
  }
  return stamped.sort((a, b) => b.at - a.at);
}

/** Reminders overdue past the list's window: counted, not listed. */
export function olderReminders(movies: Movie[], now = Date.now()): number {
  return movies.filter((movie) => !movie.watched && Number(movie.remindAt) > 0 && now - Number(movie.remindAt) > REMINDER_WINDOW).length;
}

// Dismissed notifications, on this device (a notification is a view of the
// list, so there's nothing to sync: dealing with the title clears it anyway).
const DISMISSED_KEY = "flickcue.notificationsDismissed";
export const DISMISSED_EVENT = "flickcue:notifications-dismissed";

export function getDismissed(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

export function dismiss(id: string) {
  const ids = [...getDismissed(), id].slice(-300);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // Without storage it stays dismissed for this visit only.
  }
  window.dispatchEvent(new Event(DISMISSED_EVENT));
}

/** Puts a dismissed notification back (the Undo after a swipe). */
export function undismiss(id: string) {
  const ids = getDismissed();
  ids.delete(id);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Without storage it stays as it was for this visit only.
  }
  window.dispatchEvent(new Event(DISMISSED_EVENT));
}

export const countUnread = (items: FlickNotification[], seenAt: number) => items.filter((item) => item.at > seenAt).length;
