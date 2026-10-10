// Exercise the hook's async import action with a tiny hook harness; no DOM,
// credentials, real storage, network or Drive writes.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Candidate, LibraryDocument } from "./types";
import type { PublicProfile } from "./letterboxdPublic";
const harness = vi.hoisted(() => ({
  generation: 0, cleanups: [] as (() => void)[],
  state: { settings: { letterboxd: "fan" }, sync: { account: { email: "me@example.com" } }, library: { movies: [], deleted: [] } as LibraryDocument },
  commit: vi.fn(), fetch: vi.fn(), resolve: vi.fn()
}));
vi.mock("react", () => ({ useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [value, () => {}], useEffect: (effect: () => (() => void)) => { harness.cleanups.push(effect()); } }));
vi.mock("./store", () => ({ getState: () => harness.state, getSessionGeneration: () => harness.generation, commit: harness.commit }));
vi.mock("./letterboxdPublic", async importOriginal => ({ ...await importOriginal<typeof import("./letterboxdPublic")>(), fetchPublicProfile: harness.fetch, resolvePublicEntry: harness.resolve }));
import { usePublicLetterboxd } from "./usePublicLetterboxd";
const profile: PublicProfile = { username: "fan", entries: [{ slug: "a-film", title: "A Film", year: "2026", tmdbId: "1", tmdbType: "movie", watched: true }], recentAvailable: true, recentCount: 1, watchlistAvailable: true, watchlistComplete: true, watchlistCount: 0, warnings: [], fetchedAt: 1 };
const candidate: Candidate = { key: "tmdb:movie:1", title: "A Film (2026)", year: "2026", tmdbId: "1", tmdbType: "movie", mediaType: "Movie", poster: "", backdrop: "", overview: "", rating: "", upcoming: false, releaseDate: "2026-01-01" };
let storage: Map<string, string>;
beforeEach(() => {
  harness.generation = 0; harness.cleanups = [];
  harness.state = { settings: { letterboxd: "fan" }, sync: { account: { email: "me@example.com" } }, library: { movies: [], deleted: [] } };
  harness.commit.mockReset(); harness.fetch.mockReset().mockResolvedValue(profile); harness.resolve.mockReset().mockResolvedValue(candidate);
  storage = new Map(); vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => { for (const cleanup of harness.cleanups) cleanup?.(); vi.unstubAllGlobals(); });
describe("web import action", () => {
  it.each(["account", "profile", "unmount"])("discards an import after %s changes", async change => {
    let finish!: (candidate: Candidate) => void;
    harness.resolve.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const hook = usePublicLetterboxd("me@example.com", "fan");
    const pending = hook.startImport();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    if (change === "account") { harness.generation++; harness.state.sync.account.email = "other@example.com"; }
    if (change === "profile") harness.state.settings.letterboxd = "other";
    if (change === "unmount") harness.cleanups.forEach(cleanup => cleanup?.());
    finish(candidate); await pending;
    expect(harness.commit).not.toHaveBeenCalled(); expect(storage.size).toBe(0);
  });
  it("keeps edits made while the public profile was loading", async () => {
    harness.state.library.movies = [{ id: "old", title: "A Film", tmdbId: "1", tmdbType: "movie", personal: { review: "Before" } }];
    let finish!: (profile: PublicProfile) => void;
    harness.fetch.mockImplementationOnce(async () => profile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = usePublicLetterboxd("me@example.com", "fan").startImport();
    harness.state.library.movies[0] = { ...harness.state.library.movies[0], personal: { review: "Edited during import" } };
    finish(profile); await pending;
    expect(harness.commit.mock.calls[0][0].movies[0].personal.review).toBe("Edited during import");
  });
  it("keeps a title removed while its profile was loading removed", async () => {
    harness.state.library.movies = [{ id: "old", title: "A Film", tmdbId: "1", tmdbType: "movie" }];
    let finish!: (profile: PublicProfile) => void;
    harness.fetch.mockImplementationOnce(async () => profile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = usePublicLetterboxd("me@example.com", "fan").startImport();
    harness.state.library = { movies: [], deleted: [{ id: "old", deletedAt: 2 }] };
    finish(profile); await pending;
    expect(harness.commit).not.toHaveBeenCalled();
  });
});
