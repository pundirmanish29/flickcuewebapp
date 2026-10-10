// Letterboxd on the web. The link to a profile is kept per device, as it is in
// the extension and the Android app (SHARED.md, "Local-only data"); what the
// extension imported from Letterboxd rides along on each title as
// `letterboxd: {slug, rating, liked, review, inWatchlist, watched}`.

import type { Movie } from "./types";

// Letterboxd usernames are letters, numbers and underscores, and its URLs are
// case-insensitive, so the handle is kept lowercased, as the extension does.
const USERNAME = /^[a-z0-9_]{1,30}$/;

/** "@Name", "letterboxd.com/name/films" or a full URL, down to "name"; "" when it isn't a username. */
export function letterboxdHandle(raw: unknown): string {
  let value = String(raw ?? "").trim();
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?letterboxd\.com\/([^/?#]+)/i);
  if (url) value = url[1];
  else value = value.replace(/^@/, "").replace(/^\/+|\/+$/g, "").split("/")[0];
  const handle = value.toLowerCase();
  return USERNAME.test(handle) ? handle : "";
}

export const letterboxdProfileUrl = (handle: string) => `https://letterboxd.com/${handle}/`;

export interface LetterboxdData {
  rating?: number;
  liked?: boolean;
  review?: string;
  watched?: boolean;
}

export interface LetterboxdStats {
  /** Titles carrying anything from Letterboxd. */
  linked: number;
  rated: number;
  liked: number;
  reviewed: number;
}

export function letterboxdStats(movies: Movie[]): LetterboxdStats {
  const stats: LetterboxdStats = { linked: 0, rated: 0, liked: 0, reviewed: 0 };
  for (const movie of movies) {
    const data = movie.letterboxd as LetterboxdData | undefined;
    if (!data && movie.origin !== "letterboxd") continue;
    stats.linked += 1;
    if (Number(data?.rating) > 0) stats.rated += 1;
    if (data?.liked) stats.liked += 1;
    if (typeof data?.review === "string" && data.review.trim()) stats.reviewed += 1;
  }
  return stats;
}
