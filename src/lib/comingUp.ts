// What's ahead, for the Notifications page: the reminders set for the coming
// week and the shows you have tickets for. Pure, so it can be tested; the page
// draws it under the notifications, or in place of "all caught up".

import { hasUpcomingBooking } from "./rules";
import type { Movie } from "./types";

const DAY = 86_400_000;
export const COMING_UP_DAYS = 7;
/** A ticket is worth showing further ahead than a reminder: you've already paid for it. */
export const BOOKING_DAYS = 30;
export const COMING_UP_LIMIT = 8;

export interface ComingUp {
  movie: Movie;
  kind: "reminder" | "booking";
  /** When the reminder goes off, or the show starts. */
  at: number;
}

export function comingUp(movies: readonly Movie[], now = Date.now()): ComingUp[] {
  const entries: ComingUp[] = [];
  for (const movie of movies) {
    if (movie.watched) continue;
    // A booked film is its show; the reminder the ticket set an hour before is part of it.
    if (movie.booking && hasUpcomingBooking(movie, now) && movie.booking.showAt > now) {
      if (movie.booking.showAt - now <= BOOKING_DAYS * DAY) entries.push({ movie, kind: "booking", at: movie.booking.showAt });
      continue;
    }
    const remindAt = Number(movie.remindAt ?? 0);
    if (remindAt > now && remindAt - now <= COMING_UP_DAYS * DAY) entries.push({ movie, kind: "reminder", at: remindAt });
  }
  return entries.sort((a, b) => a.at - b.at).slice(0, COMING_UP_LIMIT);
}
