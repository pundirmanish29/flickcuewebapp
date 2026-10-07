// The title page's ticket stub: where you stand with a title (not out yet, in
// your queue, booked, watched, not saved) as a coloured label, up to four
// short fields, and the one main thing to do next. Pure, so every state can be
// tested; TitlePage draws it and wires the actions.

import { formatRelativeDay, formatReminder, formatShowTime, hasActiveReminder, knownWatchedAt, yourTake } from "./rules";
import { verdictLabel, verdictOf } from "./verdict";
import type { Movie } from "./types";

export type StubTone = "orange" | "blue" | "green" | "neutral";
/** The main button: save it, set a reminder, watch it where it streams, mark it watched, show the ticket, or watch it again. */
export type StubPrimary = "save" | "remind" | "watch" | "watched" | "ticket" | "watchAgain" | "none";

export interface StubField {
  label: string;
  value: string;
}

export interface TitleStub {
  tone: StubTone;
  label: string;
  fields: StubField[];
  primary: StubPrimary;
}

export interface StubInput {
  movie: Movie;
  saved: boolean;
  show: boolean;
  unreleased: boolean;
  /** Films: the release date in the reader's region if it has one; shows: the premiere. ISO, or "". */
  releaseDate: string;
  /** Where it streams in the reader's region: a subscription service first, else one to rent or buy. */
  provider: { name: string; included: boolean } | null;
  /** Shows: the episode to watch next ("S1 E1"), or "". */
  upNext: string;
  /** "2h 25m", "2 seasons", or "". */
  length: string;
  now: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** "15 Oct" from an ISO date ("15 Oct 2027" when it's not this year). */
export function formatDay(iso: string, now = Date.now()): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (!ISO_DAY.test(iso) || Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

/** "today", "tomorrow", "in 5 days", "yesterday" for an ISO date. */
export function dayLabel(iso: string, now = Date.now()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - start.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 1 ? `in ${days} days` : `${-days} days ago`;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const field = (label: string, value: string | undefined): StubField[] => (value ? [{ label, value }] : []);
const whereText = (provider: StubInput["provider"]) => (provider ? `${provider.name}${provider.included ? "" : " · rent or buy"}` : "");

export function titleStub(input: StubInput): TitleStub {
  const { movie, saved, show, unreleased, releaseDate, provider, upNext, length, now } = input;

  // A booked film: the show is what matters, until it's watched.
  if (saved && !show && movie.booking && !movie.watched) {
    const booking = movie.booking;
    return {
      tone: "green",
      label: "Booked",
      fields: [
        ...field("Show", formatShowTime(booking.showAt, now)),
        ...field("Cinema", booking.cinema?.trim()),
        ...field("Screen", booking.screen?.trim()),
        ...field("Seats", booking.seats?.length ? booking.seats.join(", ") : "")
      ],
      primary: "ticket"
    };
  }

  if (saved && movie.watched) {
    const at = knownWatchedAt(movie);
    const take = yourTake(movie);
    const verdict = verdictOf(take.stars);
    return {
      tone: "green",
      label: "Watched",
      fields: [
        { label: "When", value: at ? capital(formatRelativeDay(at, now)) : "Date not known" },
        { label: "Your take", value: verdict ? `${verdictLabel(verdict)}${take.liked ? ", liked" : ""}` : take.liked ? "Liked" : "Not rated yet" }
        // Where to watch it again is the main button's own label; when it was saved is under the details.
      ],
      primary: provider ? "watchAgain" : "none"
    };
  }

  if (unreleased) {
    const reminder = saved
      ? hasActiveReminder(movie, now) ? capital(formatReminder(movie.remindAt!, now)) : "Off"
      : "";
    return {
      tone: "orange",
      label: show ? "Premieres soon" : "Coming soon",
      fields: [
        ...field(show ? "Premieres" : "Opens", releaseDate ? formatDay(releaseDate, now) : "Date not announced"),
        ...field("Countdown", releaseDate ? capital(dayLabel(releaseDate, now)) : ""),
        ...(saved ? field("Reminder", reminder) : field("On your list", "Not yet")),
        ...field("Where", show ? whereText(provider) || "To be announced" : "In cinemas")
      ].slice(0, 4),
      primary: saved ? "remind" : "save"
    };
  }

  if (!saved) {
    return {
      tone: "neutral",
      label: "Not on your list",
      fields: [
        { label: "Where", value: whereText(provider) || "Not streaming here" },
        ...field(show ? "Length" : "Runtime", length),
        ...field("Out", releaseDate ? formatDay(releaseDate, now) : movie.year),
        ...field("Rating", movie.rating ? `${movie.rating} / 10` : "")
      ].slice(0, 4),
      primary: "save"
    };
  }

  const watching = movie.personal?.status === "watching";
  // Only a reminder that has gone off is due; one later today still reads as a time.
  const due = Boolean(movie.remindAt) && Number(movie.remindAt) <= now;
  return {
    tone: "blue",
    label: watching ? "Watching" : due ? "Due now" : "In your queue",
    fields: [
      { label: "Reminder", value: hasActiveReminder(movie, now) ? capital(formatReminder(movie.remindAt!, now)) : due ? "Due now" : "None" },
      { label: "Where", value: whereText(provider) || "Not streaming here" },
      ...(show ? field("Up next", upNext) : field("Runtime", length))
      // When it was saved (and from where) is under the details, not repeated here.
    ].slice(0, 4),
    primary: provider ? "watch" : "watched"
  };
}
