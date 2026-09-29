// A sync that would take many titles out of the Drive copy at once is held
// until the reader confirms it. Removals always come as tombstones, so a bug
// that tombstones half the list, on any device, spreads everywhere at the next
// sync; this stops it at the device that made them.

import type { LibraryDocument } from "./types";

const MIN_HELD = 10;
const SHARE_HELD = 0.25;

/** Titles in the Drive copy that this device's merge would remove, by tombstones Drive doesn't have yet. */
export function newRemovals(remote: LibraryDocument, merged: LibraryDocument): string[] {
  const known = new Set((remote.deleted ?? []).map((entry) => entry.id));
  const kept = new Set(merged.movies.map((movie) => movie.id));
  const tombstoned = new Set(merged.deleted.filter((entry) => !known.has(entry.id)).map((entry) => entry.id));
  return remote.movies.filter((movie) => !kept.has(movie.id) && tombstoned.has(movie.id)).map((movie) => movie.id);
}

/** At least 10 titles, and a quarter of the list or more. */
export const needsConfirmation = (removing: number, total: number) => removing >= MIN_HELD && removing >= total * SHARE_HELD;
