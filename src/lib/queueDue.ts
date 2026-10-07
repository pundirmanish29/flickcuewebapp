import type { TonightEntry } from "./newEpisode";
import type { Movie } from "./types";

/** A due reminder and today's episode of the same title count only once; the hero is shown separately. */
export function queueDue(reminders: readonly Movie[], episodes: readonly TonightEntry[], heroId?: string) {
  const all = new Set([...reminders.map(movie => movie.id), ...episodes.map(entry => entry.movie.id)]);
  const seen = new Set<string>(heroId ? [heroId] : []);
  const airing = episodes.filter(entry => {
    if (seen.has(entry.movie.id)) return false;
    seen.add(entry.movie.id);
    return true;
  });
  const due = reminders.filter(movie => {
    if (seen.has(movie.id)) return false;
    seen.add(movie.id);
    return true;
  });
  return { total: all.size, heroDue: Boolean(heroId && all.has(heroId)), airing, reminders: due, remaining: airing.length + due.length };
}
