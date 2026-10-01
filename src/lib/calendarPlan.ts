// Which Google Calendar events a library calls for, and what to do to the
// calendar to get there. Pure: no network, no clock (`now` is always passed in).
//
// An event's id carries the movie and the minute of its reminder, so the
// calendar and the library can be compared without a lookup table:
//   - an id that is missing is created;
//   - an id that exists in any state is left alone (a time the person moved it
//     to, or an event they deleted, stays as they left it);
//   - a changed reminder is a new id: the new event is created, and the old one,
//     no longer wanted, is deleted.
// Events are only ever created or deleted, never rewritten.

import { displayTitle, isShow, localIsoDate } from "./rules";
import type { LibraryDocument, Movie } from "./types";

export const EVENT_PREFIX = "fc";
export const ORIGIN = "https://flickcue.in";

/** Google allows a client-chosen event id of lowercase a-v and 0-9, 5 to 1024 characters: base32hex. */
const ALPHABET = "0123456789abcdefghijklmnopqrstuv";
const MAX_ID_LENGTH = 1024;
const MAX_MOVIE_ID_BYTES = 400;
const MINUTE = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID_PATTERN = /^fc([0-9a-v]{8})([hb])([0-9a-v]+)$/;

function encodeBytes(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function decodeBytes(text: string): Uint8Array | null {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Uint8Array.from(bytes);
}

/** The id of the event for this movie's reminder, or null when it can't be made safely. */
export function eventIdFor(movieId: string, remindAt: number): string | null {
  const minute = Math.floor(remindAt / MINUTE);
  if (!Number.isFinite(minute) || minute <= 0 || !movieId) return null;
  const stamp = minute.toString(32).padStart(8, "0");
  if (stamp.length !== 8) return null;
  let kind: "h" | "b";
  let payload: string;
  if (UUID.test(movieId)) {
    kind = "h";
    payload = movieId.replaceAll("-", "");
  } else {
    const bytes = new TextEncoder().encode(movieId);
    if (bytes.length > MAX_MOVIE_ID_BYTES) return null;
    kind = "b";
    payload = encodeBytes(bytes);
  }
  const id = `${EVENT_PREFIX}${stamp}${kind}${payload}`;
  return id.length <= MAX_ID_LENGTH ? id : null;
}

/** Reads an id made by `eventIdFor`; null for anything else (an event that isn't ours). */
export function parseEventId(id: string): { movieId: string; minute: number } | null {
  const match = ID_PATTERN.exec(id);
  if (!match) return null;
  const minute = parseInt(match[1], 32);
  if (!Number.isFinite(minute) || minute <= 0) return null;
  let movieId: string;
  if (match[2] === "h") {
    const hex = match[3];
    if (!/^[0-9a-f]{32}$/.test(hex)) return null;
    movieId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } else {
    const bytes = decodeBytes(match[3]);
    if (!bytes || !bytes.length) return null;
    try {
      movieId = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }
  // Only the exact form we write counts, so a look-alike id is never taken for ours.
  return eventIdFor(movieId, minute * MINUTE) === id ? { movieId, minute } : null;
}

export interface DesiredEvent {
  id: string;
  movieId: string;
  startMs: number;
  endMs: number;
  summary: string;
  description: string;
  url: string;
}

const MIN_DURATION = 30;
const MAX_DURATION = 240;
const SUMMARY_LIMIT = 200;

function plainName(movie: Movie): string {
  return displayTitle(movie).replace(/[<>]/g, "").replace(/\s+/g, " ").trim() || "a title";
}

function durationMinutes(movie: Movie): number {
  const runtime = Number(movie.runtimeMinutes);
  const base = runtime > 0 ? runtime : isShow(movie) ? 45 : 120;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(base)));
}

/**
 * The events the library calls for: a reminder still to come, on a title that is
 * neither watched nor removed. (Watching a title leaves its `remindAt` in place,
 * so watched has to be left out here.)
 */
export function desiredEvents(library: LibraryDocument, now: number, origin = ORIGIN): DesiredEvent[] {
  const removedAt = new Map((library.deleted ?? []).map((entry) => [entry.id, Number(entry.deletedAt) || 0]));
  const seen = new Set<string>();
  const events: DesiredEvent[] = [];
  for (const movie of library.movies ?? []) {
    const remindAt = Number(movie.remindAt);
    if (movie.watched || !Number.isFinite(remindAt) || remindAt <= now) continue;
    if ((removedAt.get(movie.id) ?? -1) >= (Number(movie.updatedAt ?? movie.createdAt) || 0)) continue;
    const id = eventIdFor(movie.id, remindAt);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const startMs = Math.floor(remindAt / MINUTE) * MINUTE;
    const name = plainName(movie);
    const releaseDay = /^\d{4}-\d{2}-\d{2}$/.test(movie.releaseDate ?? "") && movie.releaseDate === localIsoDate(startMs);
    const url = `${origin}/#/title/${encodeURIComponent(movie.id)}`;
    const year = /^\d{4}$/.test(movie.year ?? "") ? ` (${movie.year})` : "";
    events.push({
      id,
      movieId: movie.id,
      startMs,
      endMs: startMs + durationMinutes(movie) * MINUTE,
      summary: `${releaseDay ? "Out today" : "Watch"}: ${name}`.slice(0, SUMMARY_LIMIT),
      description: `${name}${year}\nOpen in FlickCue: ${url}`,
      url
    });
  }
  return events;
}

export interface ExistingEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
}

export type CalendarOp =
  | { type: "create"; event: DesiredEvent }
  /** An event we deleted ourselves, wanted again at the same minute: brought back rather than created. */
  | { type: "revive"; event: DesiredEvent }
  | { type: "delete"; id: string };

export interface Plan {
  ops: CalendarOp[];
  /** Deletes were left out because there were too many to be believable. */
  held: boolean;
  /** How many deletes the plan called for, whether or not they were held. */
  deletes: number;
  /** Operations left for a later run (the cap was reached). */
  remaining: number;
}

export interface PlanOptions {
  maxOps?: number;
  /** Deletes above max(5, this share of our upcoming events) are held unless `allowBulkDelete`. */
  maxDeleteFraction?: number;
  allowBulkDelete?: boolean;
  /** Ids this device deleted itself; if wanted again they are revived. */
  deletedByUs?: ReadonlySet<string>;
}

export function planCalendar(desired: DesiredEvent[], existing: ExistingEvent[], options: PlanOptions = {}, now = 0): Plan {
  const { maxOps = 25, maxDeleteFraction = 0.5, allowBulkDelete = false, deletedByUs } = options;
  const known = new Map(existing.map((event) => [event.id, event.status]));
  const wanted = new Set(desired.map((event) => event.id));

  const creates: CalendarOp[] = [];
  for (const event of desired) {
    const status = known.get(event.id);
    if (status === undefined) creates.push({ type: "create", event });
    else if (status === "cancelled" && deletedByUs?.has(event.id)) creates.push({ type: "revive", event });
  }

  // Only our own events whose reminder is still to come, and that are still on the calendar, are ever deleted:
  // a reminder that has passed is history.
  const upcoming = existing.filter((event) => {
    if (event.status === "cancelled") return false;
    const parsed = parseEventId(event.id);
    return Boolean(parsed) && parsed!.minute * MINUTE > now;
  });
  const stale = upcoming.filter((event) => !wanted.has(event.id));
  const deletes: CalendarOp[] = stale.map((event) => ({ type: "delete", id: event.id }));

  const held = !allowBulkDelete && deletes.length > Math.max(5, Math.floor(upcoming.length * maxDeleteFraction));
  const all = [...(held ? [] : deletes), ...creates];
  return { ops: all.slice(0, maxOps), held, deletes: deletes.length, remaining: Math.max(0, all.length - maxOps) };
}

/** The body for `events.insert`: a timed event that shows as free and pops up once, at the reminder time. */
export function eventBody(event: DesiredEvent, timeZone: string): Record<string, unknown> {
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: { dateTime: new Date(event.startMs).toISOString(), timeZone },
    end: { dateTime: new Date(event.endMs).toISOString(), timeZone },
    source: { title: "FlickCue", url: event.url },
    transparency: "transparent",
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
    extendedProperties: { private: { flickcue: "1", movieId: event.movieId.slice(0, 400) } }
  };
}
