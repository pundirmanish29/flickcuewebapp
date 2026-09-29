import { describe, expect, it } from "vitest";
import { mergeWatchlists } from "./merge";
import { needsConfirmation, newRemovals } from "./syncGuard";
import type { LibraryDocument, Movie } from "./types";

const NOW = new Date(2026, 8, 29).getTime();
const titles = (count: number): Movie[] => Array.from({ length: count }, (_, i) => ({ id: `m${i}`, title: `Title ${i}`, year: String(1990 + i), createdAt: 1, updatedAt: 1 }));

describe("sync guard", () => {
  const remote: LibraryDocument = { movies: titles(40), deleted: [] };

  it("counts titles this device's new tombstones would take out of Drive", () => {
    const local: LibraryDocument = { movies: titles(40).slice(20), deleted: titles(20).map((movie) => ({ id: movie.id, deletedAt: NOW - 1000 })) };
    const merged = mergeWatchlists(local, remote, NOW);
    expect(newRemovals(remote, merged)).toHaveLength(20);
    expect(needsConfirmation(20, 40)).toBe(true);
  });

  it("lets ordinary removals and ones Drive already has through", () => {
    const one: LibraryDocument = { movies: titles(40).slice(1), deleted: [{ id: "m0", deletedAt: NOW - 1000 }] };
    expect(newRemovals(remote, mergeWatchlists(one, remote, NOW))).toEqual(["m0"]);
    expect(needsConfirmation(1, 40)).toBe(false);
    const known: LibraryDocument = { movies: titles(40).slice(20), deleted: titles(20).map((movie) => ({ id: movie.id, deletedAt: NOW - 1000 })) };
    expect(newRemovals(known, mergeWatchlists(known, known, NOW))).toHaveLength(0);
    expect(needsConfirmation(12, 100)).toBe(false);
  });
});
