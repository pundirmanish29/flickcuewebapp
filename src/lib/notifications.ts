// Notifications are worked out from the list itself, the way the badges and
// "On your radar" are: nothing is sent or stored except when the reader last
// looked, so every device shows the same ones for the same list.

import { displayTitle, getShowSchedule, isShow, localIsoDate } from "./rules";
import { cinemaKey } from "./tmdb";
import type { Movie } from "./types";

const DAY = 24 * 60 * 60 * 1000;
// How far back a release or episode is still news.
const RELEASE_WINDOW = 14 * DAY;
const EPISODE_WINDOW = 7 * DAY;
const LIMIT = 60;
const SEEN_KEY = "flickcue.notificationsSeenAt";
const CINEMA_SEEN_KEY = "flickcue.cinemaSeenAt";

/** Which saved films are in cinemas, when each was first seen there, and where. */
export interface CinemaState {
  keys: Set<string>;
  firstSeen: Record<string, number>;
  place: string;
}

export type NotificationKind = "reminder" | "release" | "cinema" | "premiere" | "episode" | "season" | "finale";

export interface FlickNotification {
  /** Stable across loads, so an item keeps its place and read state. */
  id: string;
  movieId: string;
  kind: NotificationKind;
  /** When it happened: the reminder time, or midnight on the release or air date. */
  at: number;
  text: string;
  detail: string;
}

/** Midnight local time on an ISO date, or NaN when it isn't one. */
function dayStart(iso: string | undefined): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? new Date(`${iso}T00:00:00`).getTime() : NaN;
}

const recent = (at: number, window: number, now: number) => Number.isFinite(at) && at <= now && now - at <= window;

export function buildNotifications(movies: Movie[], now = Date.now(), cinema?: CinemaState): FlickNotification[] {
  const items: FlickNotification[] = [];
  for (const movie of movies) {
    if (movie.watched) continue;
    const title = displayTitle(movie);

    const remindAt = Number(movie.remindAt);
    if (remindAt > 0 && remindAt <= now) {
      items.push({
        id: `reminder:${movie.id}:${remindAt}`, movieId: movie.id, kind: "reminder", at: remindAt,
        text: `Time to watch ${title}`, detail: "Your reminder is due"
      });
    }

    if (!isShow(movie)) {
      // In cinemas where the reader is says more than "released" somewhere.
      const key = cinemaKey(movie);
      if (cinema && key && cinema.keys.has(key)) {
        items.push({
          id: `cinema:${movie.id}`, movieId: movie.id, kind: "cinema", at: cinema.firstSeen[key] || now,
          text: `${title} is in cinemas`, detail: `Showing in ${cinema.place}`
        });
        continue;
      }
      const released = dayStart(movie.releaseDate);
      if (recent(released, RELEASE_WINDOW, now)) {
        items.push({
          id: `release:${movie.id}:${movie.releaseDate}`, movieId: movie.id, kind: "release", at: released,
          text: `${title} is out now`, detail: released >= dayStart(localIsoDate(now)) ? "Released today" : "Newly released"
        });
      }
      continue;
    }

    const schedule = getShowSchedule(movie);
    const premiere = dayStart(schedule?.firstAirDate || movie.releaseDate);
    if (recent(premiere, RELEASE_WINDOW, now)) {
      items.push({
        id: `premiere:${movie.id}`, movieId: movie.id, kind: "premiere", at: premiere,
        text: `${title} has premiered`, detail: "The first episode is out"
      });
    }
    const last = schedule?.last;
    const aired = dayStart(last?.date);
    // A premiere already covers its own first episode.
    if (last && recent(aired, EPISODE_WINDOW, now) && aired !== premiere) {
      const code = `S${last.season} · E${last.episode}`;
      const kind: NotificationKind = last.finale ? "finale" : last.episode === 1 && last.season > 1 ? "season" : "episode";
      items.push({
        id: `episode:${movie.id}:S${last.season}E${last.episode}`, movieId: movie.id, kind, at: aired,
        text: kind === "finale" ? `The season ${last.season} finale of ${title} is out`
          : kind === "season" ? `Season ${last.season} of ${title} is here`
          : `New episode of ${title}`,
        detail: code
      });
    }
  }
  return items.sort((a, b) => b.at - a.at).slice(0, LIMIT);
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

export const countUnread = (items: FlickNotification[], seenAt: number) => items.filter((item) => item.at > seenAt).length;
