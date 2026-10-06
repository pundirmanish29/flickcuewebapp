import { describe, expect, it } from "vitest";
import { STALE_AFTER, pauseNotice, pendingChanges } from "./pending";
import type { LibraryDocument } from "./types";

const HOUR = 3_600_000;
const library = (movies: Array<{ id: string; updatedAt?: number; createdAt?: number }>, deleted: Array<{ id: string; deletedAt: number }> = []) =>
  ({ movies, deleted }) as unknown as LibraryDocument;

describe("pendingChanges", () => {
  it("counts titles edited after the last sync, and none edited before it", () => {
    const lib = library([{ id: "a", updatedAt: 100 }, { id: "b", updatedAt: 900 }, { id: "c", updatedAt: 1500 }]);
    expect(pendingChanges(lib, 0, 1000)).toBe(1);
    expect(pendingChanges(lib, 0, 2000)).toBe(0);
  });

  it("falls back to createdAt for a title never edited", () => {
    expect(pendingChanges(library([{ id: "a", createdAt: 1500 }]), 0, 1000)).toBe(1);
  });

  it("counts removals and a changed synced setting", () => {
    const lib = library([], [{ id: "x", deletedAt: 1500 }, { id: "y", deletedAt: 10 }]);
    expect(pendingChanges(lib, 1600, 1000)).toBe(2);
    expect(pendingChanges(lib, 500, 1000)).toBe(1);
  });

  it("counts everything when nothing has synced yet", () => {
    expect(pendingChanges(library([{ id: "a", updatedAt: 5 }, { id: "b", updatedAt: 6 }]), 0, 0)).toBe(2);
  });

  it("copes with an empty or missing document", () => {
    expect(pendingChanges({} as LibraryDocument, 0, 1000)).toBe(0);
  });
});

describe("pauseNotice", () => {
  const now = 100 * HOUR;
  it("stays quiet when nothing is waiting and the list was in step recently", () => {
    expect(pauseNotice(0, now - HOUR, now)).toEqual({ show: false });
    expect(pauseNotice(0, now - STALE_AFTER, now)).toEqual({ show: false });
  });

  it("speaks up for edits waiting, however recent the sync", () => {
    expect(pauseNotice(3, now - 60_000, now)).toEqual({ show: true, reason: "pending", pending: 3 });
  });

  it("speaks up when the list has not synced for a long while, or never has", () => {
    expect(pauseNotice(0, now - STALE_AFTER - 1, now)).toEqual({ show: true, reason: "stale", pending: 0 });
    expect(pauseNotice(0, 0, now)).toEqual({ show: true, reason: "stale", pending: 0 });
  });
});
