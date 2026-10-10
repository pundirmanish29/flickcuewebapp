import type { Movie } from "./types";

function stars(value: unknown): number {
  const rating = Number(value);
  return Number.isFinite(rating) ? Math.round(Math.max(0, Math.min(5, rating)) * 2) / 2 : 0;
}

/** Personal ratings and imported ratings are separate; neither fills the other. */
export function ratingSources(movie: Movie) {
  const letterboxd = movie.letterboxd as { rating?: unknown } | undefined;
  return { flickcue: stars(movie.personal?.rating), letterboxd: stars(letterboxd?.rating) };
}
