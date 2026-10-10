import { describe, expect, it, vi } from "vitest";
import { mergePublicEntries, resolvePublicEntry, type PublicEntry } from "./letterboxdPublic";
import type { Candidate, LibraryDocument } from "./types";
import { parseFeed, parseWatchlist, publicProfile } from "../../server/letterboxd-public.js";
import { fetchCandidate, searchTitles } from "./tmdb";
vi.mock("./tmdb", () => ({ fetchCandidate: vi.fn(), searchTitles: vi.fn() }));
const candidate: Candidate = { key: "tmdb:movie:1", title: "A Film (2026)", year: "2026", tmdbId: "1", tmdbType: "movie", mediaType: "Movie", poster: "", backdrop: "", overview: "", rating: "", upcoming: false, releaseDate: "2026-01-01" };
const entry: PublicEntry = { slug: "a-film", title: "A Film", year: "2026", tmdbId: "1", tmdbType: "movie", watched: true, watchedDate: "2026-01-03", rating: 4, liked: true, review: "Nice" };
const empty: LibraryDocument = { movies: [], deleted: [] };
const feed = (items: string) => `<rss><channel><title>Letterboxd - Film Fan</title>${items}</channel></rss>`;
const item = (date = "2026-01-03") => `<item><link>https://letterboxd.com/fan/film/a-film/</link><letterboxd:filmTitle>A &amp; Film</letterboxd:filmTitle><letterboxd:filmYear>2026</letterboxd:filmYear><letterboxd:watchedDate>${date}</letterboxd:watchedDate><tmdb:movieId>1</tmdb:movieId><letterboxd:memberRating>4</letterboxd:memberRating><description><![CDATA[<p><img src="x"/></p><p>Great <b>film</b></p>]]></description></item>`;

describe("public source parsing and failures", () => {
  it("parses recent data, strips markup, and keeps the latest rewatch", () => {
    const result = parseFeed(feed(item() + item("2025-01-01")), "fan");
    expect(result.displayName).toBe("Film Fan");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ title: "A & Film", watchedDate: "2026-01-03", review: "Great film", rating: 4 });
  });
  it("rejects challenge pages and invalid dates, and ignores someone else's entries", () => {
    expect(() => parseWatchlist('<title>Just a moment</title>')).toThrow();
    expect(() => parseWatchlist('<div class="poster-list">Unknown page</div>')).toThrow();
    expect(parseFeed(feed(item("2026-02-31")), "fan").entries[0].watchedDate).toBe("");
    expect(parseFeed(feed(item()), "other").entries).toEqual([]);
  });
  it("doesn't call a truncated watchlist complete when its next link is missing", async () => {
    const html = '<span class="js-watchlist-count">20 films</span><div data-item-name="A Film (2026)" data-item-slug="a-film"></div>';
    const request = vi.fn(async (url: string | URL | Request) => new Response(String(url).endsWith("rss/") ? feed(item()) : html));
    const result = await publicProfile("fan", request as typeof fetch);
    expect(result.watchlistCount).toBe(1);
    expect(result.watchlistComplete).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });
  it("keeps diary imports available when watchlist fails", async () => {
    const request = vi.fn(async (url: string | URL | Request) => new Response(String(url).endsWith("rss/") ? feed(item()) : "blocked", { status: String(url).endsWith("rss/") ? 200 : 403 }));
    const result = await publicProfile("fan", request as typeof fetch);
    expect(result.recentAvailable).toBe(true);
    expect(result.watchlistAvailable).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });
  it("never fetches arbitrary hosts or treats a failed profile as an empty import", async () => {
    const request = vi.fn(async () => new Response("blocked", { status: 403 }));
    await expect(publicProfile("../../evil", request as typeof fetch)).rejects.toThrow("valid");
    expect(request).not.toHaveBeenCalled();
    await expect(publicProfile("fan", request as typeof fetch)).rejects.toThrow("public profile");
    expect(request.mock.calls).toHaveLength(2);
  });
});
describe("safe, additive web imports", () => {
  it("adds watched films with dates and stable identities, then repeats without changes", () => {
    const first = mergePublicEntries(empty, [{ entry, candidate }], null, 100);
    expect(first.document.movies[0]).toMatchObject({ id: "letterboxd:tmdb:movie:1", watched: true, watchedAt: Date.parse("2026-01-03T12:00:00Z"), letterboxd: { rating: 4 } });
    const second = mergePublicEntries(first.document, [{ entry, candidate }], first.record, 200);
    expect(second.document).toBe(first.document);
    expect(second.record.added).toBe(0);
    expect(second.record.updated).toBe(0);
  });
  it("preserves manual unwatch, personal reviews, reminders and unknown data", () => {
    const first = mergePublicEntries(empty, [{ entry, candidate }], null, 100);
    const movie = { ...first.document.movies[0], watched: false, personal: { rating: 5, review: "Mine", status: "queued" }, remindAt: 123, unknown: { keep: true } };
    const result = mergePublicEntries({ ...empty, movies: [movie] }, [{ entry: { ...entry, rating: 3 }, candidate }], first.record, 200);
    expect(result.document.movies[0]).toMatchObject({ watched: false, personal: movie.personal, remindAt: 123, unknown: movie.unknown, letterboxd: { rating: 3 } });
  });
  it("respects removals, including Drive tombstones without local history", () => {
    const first = mergePublicEntries(empty, [{ entry, candidate }], null, 100);
    const removed = { movies: [], deleted: [{ id: first.document.movies[0].id, deletedAt: 150 }] };
    expect(mergePublicEntries(removed, [{ entry, candidate }], first.record, 200).document.movies).toEqual([]);
    expect(mergePublicEntries(removed, [{ entry, candidate }], null, 200).document.movies).toEqual([]);
  });
  it("updates an existing identity without a metadata lookup or duplicate", () => {
    const library = { ...empty, movies: [{ id: "existing", title: "A Film", tmdbId: "1", tmdbType: "movie", watched: false }] };
    const result = mergePublicEntries(library, [{ entry, candidate: null }], null, 100);
    expect(result.document.movies).toHaveLength(1);
    expect(result.document.movies[0]).toMatchObject({ id: "existing", watched: true });
  });
  it("doesn't clear older data missing from a partial source", () => {
    const first = mergePublicEntries(empty, [{ entry, candidate }], null, 100);
    const result = mergePublicEntries(first.document, [{ entry: { slug: entry.slug, title: entry.title, year: entry.year, inWatchlist: true }, candidate: null }], first.record, 200);
    expect(result.document.movies[0].letterboxd).toMatchObject({ watched: true, rating: 4, review: "Nice", inWatchlist: true });
  });
  it("uses feed TMDB ids and skips ambiguous title matches", async () => {
    vi.mocked(fetchCandidate).mockResolvedValue(candidate);
    expect(await resolvePublicEntry(entry)).toBe(candidate);
    expect(fetchCandidate).toHaveBeenCalledWith("movie", "1");
    vi.mocked(searchTitles).mockResolvedValue({ titles: [candidate, { ...candidate, tmdbId: "2" }] });
    expect(await resolvePublicEntry({ slug: "a-film", title: "A Film", year: "2026" })).toBeNull();
  });
});
