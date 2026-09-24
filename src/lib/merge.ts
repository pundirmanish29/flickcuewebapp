// drive-sync.js's mergeWatchlists, kept rule for rule: newest `updatedAt` wins
// per id, a delete wins only if nothing edited the title afterwards,
// tombstones expire after 90 days, and the same title saved separately on
// two devices collapses onto the older record.

import { movieDedupKey } from "./rules";
import type { LibraryDocument, Movie } from "./types";

export const TOMBSTONE_TTL = 1000 * 60 * 60 * 24 * 90;

export function getStamp(movie: Movie | undefined): number {
  return Number(movie?.updatedAt ?? movie?.createdAt ?? 0);
}

function getCreated(movie: Movie | undefined): number {
  return Number(movie?.createdAt ?? 0);
}

export function mergeWatchlists(local: Partial<LibraryDocument>, remote: Partial<LibraryDocument>, now = Date.now()): LibraryDocument {
  const tombstones = new Map<string, number>();
  const byId = new Map<string, Movie>();
  const cutoff = now - TOMBSTONE_TTL;

  for (const entry of [...(remote.deleted ?? []), ...(local.deleted ?? [])]) {
    if (!entry?.id) continue;
    const deletedAt = Number(entry.deletedAt ?? 0);
    if (deletedAt < cutoff) continue;
    tombstones.set(entry.id, Math.max(tombstones.get(entry.id) ?? 0, deletedAt));
  }

  for (const movie of [...(remote.movies ?? []), ...(local.movies ?? [])]) {
    if (!movie?.id || !movie?.title) continue;
    const existing = byId.get(movie.id);
    if (!existing || getStamp(movie) > getStamp(existing)) byId.set(movie.id, movie);
  }

  for (const [id, deletedAt] of tombstones) {
    const movie = byId.get(id);
    if (movie && getStamp(movie) <= deletedAt) byId.delete(id);
  }

  const byTitle = new Map<string, Movie>();

  for (const movie of [...byId.values()].sort((a, b) => getCreated(a) - getCreated(b))) {
    let key = movieDedupKey(movie);
    if (!byTitle.has(key)) {
      const parts = key.split("|");
      const compatible = [...byTitle.keys()].filter((candidate) => {
        const other = candidate.split("|");
        return other[0] === parts[0]
          && (!other[1] || !parts[1] || other[1] === parts[1])
          && (!other[2] || !parts[2] || other[2] === parts[2]);
      });
      if (compatible.length === 1) key = compatible[0];
    }
    const existing = byTitle.get(key);

    if (!existing) {
      byTitle.set(key, movie);
      continue;
    }

    const winner = getStamp(movie) > getStamp(existing) ? movie : existing;
    const merged: Movie = {
      ...winner,
      year: winner.year || movie.year || existing.year
        || String(movie.title).match(/\((\d{4})\)/)?.[1] || String(existing.title).match(/\((\d{4})\)/)?.[1] || "",
      mediaType: winner.mediaType || movie.mediaType || existing.mediaType,
      id: existing.id,
      createdAt: Math.min(getCreated(existing), getCreated(movie)) || getCreated(existing)
    };
    byTitle.delete(key);
    byTitle.set(movieDedupKey(merged), merged);
  }

  return {
    movies: [...byTitle.values()].sort((a, b) => getCreated(b) - getCreated(a)),
    deleted: [...tombstones].map(([id, deletedAt]) => ({ id, deletedAt }))
  };
}
