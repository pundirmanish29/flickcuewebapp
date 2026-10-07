import { mergeWatchlists } from "./merge";
import type { LibraryDocument } from "./types";

export function backupPreview(current: LibraryDocument, backup: LibraryDocument, now = Date.now()) {
  const merged = mergeWatchlists(current, backup, now);
  const before = new Map(current.movies.map(movie => [movie.id, movie]));
  const after = new Set(merged.movies.map(movie => movie.id));
  return {
    added: merged.movies.filter(movie => !before.has(movie.id)).length,
    updated: merged.movies.filter(movie => before.has(movie.id) && JSON.stringify(before.get(movie.id)) !== JSON.stringify(movie)).length,
    removed: current.movies.filter(movie => !after.has(movie.id)).length
  };
}
