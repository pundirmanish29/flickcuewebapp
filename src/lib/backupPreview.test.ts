import { describe, expect, it } from "vitest";
import { backupPreview } from "./backupPreview";

describe("backup restore preview", () => {
  const now = 1_800_000_000_000;
  const current = { movies: [{ id: "a", title: "Heat", updatedAt: now - 100 }, { id: "b", title: "Dune", updatedAt: now - 100 }], deleted: [] };
  it("reports newer updates, additions and valid removals from the merge", () => {
    expect(backupPreview(current, { movies: [{ id: "a", title: "Heat", watched: true, updatedAt: now }, { id: "c", title: "Arrival", updatedAt: now }], deleted: [{ id: "b", deletedAt: now }] }, now)).toEqual({ added: 1, updated: 1, removed: 1 });
  });
  it("does not report older edits or expired removals as changes", () => {
    expect(backupPreview(current, { movies: [{ id: "a", title: "Heat", watched: true, updatedAt: now - 200 }], deleted: [{ id: "b", deletedAt: now - 100 * 86400000 }] }, now)).toEqual({ added: 0, updated: 0, removed: 0 });
  });
});
