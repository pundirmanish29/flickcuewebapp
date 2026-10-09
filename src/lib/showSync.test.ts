import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TitleDetails } from "./tmdb";
import type { LibraryDocument, Movie } from "./types";

const mock = vi.hoisted(() => ({
  generation: 1,
  state: { library: { movies: [], deleted: [] } as LibraryDocument, sync: { connected: true, status: "idle", lastSyncAt: 0 } },
  commit: vi.fn()
}));
vi.mock("./store", () => ({ getState: () => mock.state, getSessionGeneration: () => mock.generation, commit: mock.commit }));
vi.mock("./tmdb", () => ({ fetchDetails: vi.fn() }));

import { writeBack } from "./showSync";
import { mergeWatchlists } from "./merge";

const movie = (note: string, updatedAt: number): Movie => ({ id: "show", title: "A followed show", mediaType: "Show", tmdbId: "1", tmdbType: "tv", updatedAt, createdAt: 1, personal: { status: "watching", note } });
const details = (): TitleDetails => ({
  overview: "New metadata", tagline: "", genres: [], runtimeMinutes: 24, status: "Returning Series", imdbId: "", rating: "",
  backdrop: "", poster: "", releaseDate: "2000-01-01", director: "", cast: [], crew: [], seasons: [], streaming: [], rentOrBuy: [], watchLink: "", trailer: "", trailerKey: "", certification: "",
  episodeMinutes: 24, seasonCount: 1, episodeCount: 2, network: "", nextEpisode: null, lastEpisode: null, language: "", regionalRelease: "", recommendations: []
});

beforeEach(() => {
  mock.generation = 1;
  mock.commit.mockReset();
  mock.state = { library: { movies: [movie("Cached note", Date.now() - 5000)], deleted: [] }, sync: { connected: true, status: "idle", lastSyncAt: Date.now() + 1000 } };
});

describe("metadata arriving around cross-client sync", () => {
  it("does not stamp a cached previous-visit title over a newer extension edit", () => {
    mock.state.sync.lastSyncAt = 1;
    const cached = mock.state.library.movies[0];
    const remote = movie("New extension note", Date.now() - 1000);
    expect(writeBack(cached, details(), 1)).toBe(false);
    expect(mock.commit).not.toHaveBeenCalled();
    expect(mergeWatchlists(mock.state.library, { movies: [remote], deleted: [] }).movies[0].personal!.note).toBe("New extension note");
  });

  it("rechecks the active sign-in and sync state when an async lookup returns", () => {
    const cached = mock.state.library.movies[0];
    mock.generation = 2;
    expect(writeBack(cached, details(), 1)).toBe(false);
    mock.generation = 1;
    mock.state.sync.status = "syncing";
    expect(writeBack(cached, details(), 1)).toBe(false);
    mock.state.sync.status = "needs-auth";
    expect(writeBack(cached, details(), 1)).toBe(false);
    expect(mock.commit).not.toHaveBeenCalled();
  });

  it("enriches the current synced record while preserving its newer personal fields", () => {
    const cached = mock.state.library.movies[0];
    mock.state.library = { movies: [movie("New extension note", Date.now() - 1000)], deleted: [] };
    expect(writeBack(cached, details(), 1)).toBe(true);
    expect(mock.commit).toHaveBeenCalledOnce();
    expect(mock.commit.mock.calls[0][0].movies[0].personal.note).toBe("New extension note");
  });
});
