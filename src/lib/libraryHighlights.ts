import { isShow, isUnreleased } from "./rules";
import { ratingSources } from "./ratingSources";
import type { Movie } from "./types";

export type TakeSource = "flickcue" | "letterboxd";
export type HighlightView = "rated" | "reviewed";

/** A fresh order without changing the saved list. */
export function shuffled<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Saved, unwatched movies that are out now, including hand-added films. */
export function queuedFilms(movies: Movie[], now = Date.now()): Movie[] {
  return movies.filter(movie => !movie.watched && !isShow(movie) && !isUnreleased(movie, now));
}

export function sourceReview(movie: Movie, source: TakeSource): string {
  const take = source === "flickcue" ? movie.personal : movie.letterboxd as { review?: unknown } | undefined;
  return typeof take?.review === "string" ? take.review.trim() : "";
}

export function sourceReviews(movie: Movie): { source: TakeSource; text: string }[] {
  return (["flickcue", "letterboxd"] as const).map(source => ({ source, text: sourceReview(movie, source) })).filter(review => review.text);
}

/** Rank by the user's highest rating, keeping the original source values on each card. */
export function highlightRating(movie: Movie): number {
  const ratings = ratingSources(movie);
  return Math.max(ratings.flickcue, ratings.letterboxd);
}

/** One card per watched title, including either source; public scores never stand in for personal stars. */
export function watchedHighlights(movies: Movie[], view: HighlightView): Movie[] {
  return movies.filter(movie => movie.watched && (view === "rated" ? highlightRating(movie) > 0 : sourceReviews(movie).length > 0))
    .sort((a, b) => highlightRating(b) - highlightRating(a)
      || (Number(b.watchedAt) || 0) - (Number(a.watchedAt) || 0)
      || a.title.localeCompare(b.title));
}
