// FlickCue → Letterboxd, as a file Letterboxd's own importer takes (letterboxd.com/import). It needs no
// access from Letterboxd: the person downloads the CSV and uploads it themselves. The payload is built
// apart from the file format (`LetterboxdEntry`), so a real API client can send the same entries later.
//
// Only what is the person's own goes out: their stars and review (`personal`), the day they watched, and
// only for films (Letterboxd has no shows) that TMDB identifies, so Letterboxd can match each one exactly.
// What came from Letterboxd is never sent back. What was already downloaded is remembered on this
// device only (like the profile link, SHARED.md "Local-only data"), so a second export carries what changed.

import type { LetterboxdData } from "./letterboxd";
import { displayTitle, importDays, isShow, knownWatchedAt, localIsoDate } from "./rules";
import type { Movie } from "./types";

export interface LetterboxdEntry {
  /** The FlickCue title's id, to remember it was exported. */
  id: string;
  /** TMDB's id for the film: Letterboxd matches on it exactly. */
  tmdbId: string;
  title: string;
  year: string;
  /** "YYYY-MM-DD", or "" when the day isn't known or Letterboxd already has the viewing. */
  watchedDate: string;
  /** 0.5–5 in halves, or 0 when there is nothing new to send. */
  rating: number;
  /** Plain text, or "" when there is nothing new to send. */
  review: string;
  /** Changes when the date, stars or review do, so an edited title goes out again. */
  fingerprint: string;
}

export interface ExportPlan {
  entries: LetterboxdEntry[];
  /** Watched films with no TMDB id (added by hand): left out, since Letterboxd could only guess at them. */
  unmatched: number;
}

/** Title id → the fingerprint last downloaded. */
export type SentRecord = Record<string, string>;

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const SENT_KEY = "flickcue.letterboxdSent";
const TMDB_ID = /^\d+$/;
// Letterboxd takes files up to 1MB; this leaves room for what counting bytes can miss.
const MAX_FILE_BYTES = 900_000;
const HEADER = "tmdbID,Title,Year,WatchedDate,Rating,Review";

function fingerprintOf(parts: Array<string | number>): string {
  let hash = 0x811c9dc5;
  for (const char of parts.join("\u0000")) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

const halfStars = (value: unknown) => Math.round(Math.max(0, Math.min(5, Number(value) || 0)) * 2) / 2;

/**
 * What to put on Letterboxd for each watched film. A film Letterboxd already has as watched (it came from
 * there) gets no viewing, only the person's own stars or review where they differ from Letterboxd's, as a
 * second diary entry would be a duplicate. `all` ignores what was downloaded before.
 */
export function planExport(movies: readonly Movie[], sent: SentRecord = {}, { all = false, now = Date.now() } = {}): ExportPlan {
  const imports = importDays(movies);
  const entries: LetterboxdEntry[] = [];
  let unmatched = 0;
  for (const movie of movies) {
    if (!movie.watched || isShow(movie)) continue;
    const tmdbId = String(movie.tmdbId ?? "").trim();
    if (!TMDB_ID.test(tmdbId)) {
      unmatched += 1;
      continue;
    }
    const letterboxd = movie.letterboxd as LetterboxdData | undefined;
    // An older extension marked titles `origin: "letterboxd"` without keeping the rest: treat those as there already.
    const onLetterboxd = letterboxd?.watched === true || (movie.origin === "letterboxd" && letterboxd?.watched !== false);

    const stars = halfStars(movie.personal?.rating);
    const review = String(movie.personal?.review ?? "").trim();
    const rating = stars && stars !== Number(letterboxd?.rating) ? stars : 0;
    const text = review && review !== String(letterboxd?.review ?? "").trim() ? review : "";
    const at = onLetterboxd ? 0 : knownWatchedAt(movie, imports);
    const watchedDate = at > 0 && at <= now ? localIsoDate(at) : "";
    if (onLetterboxd && !rating && !text) continue;

    const fingerprint = fingerprintOf([watchedDate, rating, text]);
    if (!all && sent[movie.id] === fingerprint) continue;
    entries.push({
      id: movie.id,
      tmdbId,
      title: displayTitle(movie).replace(/\s+/g, " "),
      year: String(movie.year || String(movie.title).match(/\((\d{4})\)\s*$/)?.[1] || ""),
      watchedDate,
      rating,
      review: text,
      fingerprint
    });
  }
  return { entries, unmatched };
}

// Letterboxd's importer asks for quotes inside quoted text to be escaped with a backslash.
const quoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A review is HTML on Letterboxd and a line break in a CSV field is not promised to survive, so paragraphs and breaks become tags. */
export function reviewHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function letterboxdRow(entry: LetterboxdEntry): string {
  return [
    entry.tmdbId,
    quoted(entry.title),
    entry.year,
    entry.watchedDate,
    entry.rating ? String(entry.rating) : "",
    entry.review ? quoted(reviewHtml(entry.review)) : ""
  ].join(",");
}

export interface CsvPart {
  csv: string;
  entries: LetterboxdEntry[];
}

/** The entries as CSV files, each under Letterboxd's size limit and each with the header row. */
export function letterboxdCsvParts(entries: readonly LetterboxdEntry[], maxBytes = MAX_FILE_BYTES): CsvPart[] {
  const encoder = new TextEncoder();
  const parts: CsvPart[] = [];
  let rows: string[] = [];
  let group: LetterboxdEntry[] = [];
  let size = encoder.encode(HEADER).length + 1;
  const close = () => {
    if (group.length) parts.push({ csv: `${HEADER}\n${rows.join("\n")}\n`, entries: group });
    rows = [];
    group = [];
    size = encoder.encode(HEADER).length + 1;
  };
  for (const entry of entries) {
    const row = letterboxdRow(entry);
    const bytes = encoder.encode(row).length + 1;
    if (group.length && size + bytes > maxBytes) close();
    rows.push(row);
    group.push(entry);
    size += bytes;
  }
  close();
  return parts;
}

export function letterboxdFileName(index: number, total: number, now = Date.now()): string {
  const suffix = total > 1 ? `-part-${index + 1}-of-${total}` : "";
  return `flickcue-letterboxd-${localIsoDate(now)}${suffix}.csv`;
}

function deviceStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readSent(store: KeyValueStore | null = deviceStore()): SentRecord {
  try {
    const value = JSON.parse(store?.getItem(SENT_KEY) || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
  } catch {
    return {};
  }
}

/** Remembers that these entries were downloaded. Without storage the next export simply carries them again. */
export function markSent(entries: readonly LetterboxdEntry[], store: KeyValueStore | null = deviceStore()): SentRecord {
  const sent = readSent(store);
  for (const entry of entries) sent[entry.id] = entry.fingerprint;
  try {
    store?.setItem(SENT_KEY, JSON.stringify(sent));
  } catch {
    // Storage full or refused.
  }
  return sent;
}
