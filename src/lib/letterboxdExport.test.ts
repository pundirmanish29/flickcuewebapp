import { describe, expect, it } from "vitest";
import {
  letterboxdCsvParts,
  letterboxdFileName,
  letterboxdRow,
  markSent,
  planExport,
  readSent,
  reviewHtml,
  type LetterboxdEntry
} from "./letterboxdExport";
import type { Movie } from "./types";

const NOW = new Date(2026, 9, 9, 12, 0).getTime();
const at = (month: number, day: number, hour = 21) => new Date(2026, month - 1, day, hour, 0).getTime();

const film = (extra: Partial<Movie> = {}): Movie => ({
  id: "a",
  title: "Arrival (2016)",
  year: "2016",
  tmdbType: "movie",
  tmdbId: "329865",
  watched: true,
  createdAt: at(1, 1),
  watchedAt: at(5, 3),
  ...extra
});

const entry = (extra: Partial<LetterboxdEntry> = {}): LetterboxdEntry => ({
  id: "a", tmdbId: "329865", title: "Arrival", year: "2016", watchedDate: "2026-05-03", rating: 4.5, review: "", fingerprint: "x", ...extra
});

describe("what goes to Letterboxd", () => {
  it("sends a watched film with its TMDB id, the day it was watched and the person's own stars and review", () => {
    const { entries } = planExport([film({ personal: { rating: 4.5, review: "  Slow and lovely.  " } })], {}, { now: NOW });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "a", tmdbId: "329865", title: "Arrival", year: "2016", watchedDate: "2026-05-03", rating: 4.5, review: "Slow and lovely." });
  });

  it("leaves out shows, unwatched titles and what was never watched", () => {
    const { entries, unmatched } = planExport([
      film({ id: "show", tmdbType: "tv" }),
      film({ id: "queued", watched: false }),
      film({ id: "reminder", watched: false, remindAt: at(11, 1) })
    ], {}, { now: NOW });
    expect(entries).toEqual([]);
    expect(unmatched).toBe(0);
  });

  it("counts watched films with no TMDB id as unmatched instead of letting Letterboxd guess", () => {
    const plan = planExport([film({ id: "hand", tmdbId: undefined }), film({ id: "odd", tmdbId: "tt123" })], {}, { now: NOW });
    expect(plan.entries).toEqual([]);
    expect(plan.unmatched).toBe(2);
  });

  it("sends a watched film with no known day as a plain viewing", () => {
    const { entries } = planExport([film({ watchedAt: undefined })], {}, { now: NOW });
    expect(entries[0]).toMatchObject({ watchedDate: "", rating: 0, review: "" });
  });

  it("drops a day in the future, and the stamp an older import left", () => {
    expect(planExport([film({ watchedAt: NOW + 86_400_000 })], {}, { now: NOW }).entries[0].watchedDate).toBe("");
    const stamped = film({ id: "b", origin: "letterboxd", letterboxd: { watched: false }, createdAt: at(8, 1), watchedAt: at(8, 1) + 2000 });
    expect(planExport([stamped], {}, { now: NOW }).entries[0].watchedDate).toBe("");
  });

  it("uses the local calendar day, not the UTC one", () => {
    const lateNight = new Date(2026, 4, 3, 23, 50).getTime();
    expect(planExport([film({ watchedAt: lateNight })], {}, { now: NOW }).entries[0].watchedDate).toBe("2026-05-03");
  });

  it("rounds stars to halves within 0–5 and ignores none", () => {
    const stars = (rating: unknown) => planExport([film({ personal: { rating } })], {}, { now: NOW }).entries[0].rating;
    expect(stars(3.7)).toBe(3.5);
    expect(stars(9)).toBe(5);
    expect(stars(0)).toBe(0);
    expect(stars(undefined)).toBe(0);
  });
});

describe("what came from Letterboxd is not sent back", () => {
  it("sends nothing for a film Letterboxd already has as watched", () => {
    const there = film({ origin: "letterboxd", letterboxd: { watched: true, rating: 4, review: "Yes." } });
    expect(planExport([there], {}, { now: NOW }).entries).toEqual([]);
    // The same, when the person's own take matches Letterboxd's.
    const same = film({ origin: "letterboxd", letterboxd: { watched: true, rating: 4, review: "Yes." }, personal: { rating: 4, review: "Yes." } });
    expect(planExport([same], {}, { now: NOW }).entries).toEqual([]);
  });

  it("treats an older extension's bare origin as already there", () => {
    expect(planExport([film({ origin: "letterboxd" })], {}, { now: NOW }).entries).toEqual([]);
  });

  it("sends only the person's own differing stars or review, with no second viewing", () => {
    const there = film({ origin: "letterboxd", letterboxd: { watched: true, rating: 3 }, personal: { rating: 4.5, review: "Better the second time." } });
    const { entries } = planExport([there], {}, { now: NOW });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ watchedDate: "", rating: 4.5, review: "Better the second time." });
  });

  it("sends a Letterboxd watchlist title the person has since watched here", () => {
    const fromWatchlist = film({ origin: "letterboxd", letterboxd: { watched: false }, createdAt: at(1, 1), watchedAt: at(6, 6) });
    expect(planExport([fromWatchlist], {}, { now: NOW }).entries[0].watchedDate).toBe("2026-06-06");
  });
});

describe("what was already downloaded", () => {
  const movies = [film({ personal: { rating: 4 } })];

  it("is left out the next time", () => {
    const first = planExport(movies, {}, { now: NOW });
    const sent = Object.fromEntries(first.entries.map((item) => [item.id, item.fingerprint]));
    expect(planExport(movies, sent, { now: NOW }).entries).toEqual([]);
  });

  it("goes out again when the stars, review or day change", () => {
    const first = planExport(movies, {}, { now: NOW });
    const sent = Object.fromEntries(first.entries.map((item) => [item.id, item.fingerprint]));
    expect(planExport([film({ personal: { rating: 5 } })], sent, { now: NOW }).entries).toHaveLength(1);
    expect(planExport([film({ personal: { rating: 4, review: "Added later" } })], sent, { now: NOW }).entries).toHaveLength(1);
    expect(planExport([film({ personal: { rating: 4 }, watchedAt: at(5, 4) })], sent, { now: NOW }).entries).toHaveLength(1);
  });

  it("all of it can be asked for again", () => {
    const first = planExport(movies, {}, { now: NOW });
    const sent = Object.fromEntries(first.entries.map((item) => [item.id, item.fingerprint]));
    expect(planExport(movies, sent, { now: NOW, all: true }).entries).toHaveLength(1);
  });
});

describe("the CSV", () => {
  it("writes the columns Letterboxd's importer reads", () => {
    expect(letterboxdRow(entry())).toBe('329865,"Arrival",2016,2026-05-03,4.5,');
    expect(letterboxdRow(entry({ watchedDate: "", rating: 0, review: "Quiet." }))).toBe('329865,"Arrival",2016,,,"<p>Quiet.</p>"');
  });

  it("quotes titles with commas and escapes quotes and backslashes with a backslash", () => {
    expect(letterboxdRow(entry({ title: 'Dr. Strangelove, or: How I Learned to Stop Worrying', rating: 0, watchedDate: "" })))
      .toBe('329865,"Dr. Strangelove, or: How I Learned to Stop Worrying",2016,,,');
    expect(letterboxdRow(entry({ title: 'The "Thing"', rating: 0, watchedDate: "" }))).toBe('329865,"The \\"Thing\\"",2016,,,');
    expect(letterboxdRow(entry({ title: "AC\\DC", rating: 0, watchedDate: "" }))).toBe('329865,"AC\\\\DC",2016,,,');
  });

  it("turns a review into the HTML Letterboxd takes, with no raw line breaks in the field", () => {
    expect(reviewHtml("One < two & three.\n\nSecond paragraph,\nsecond line.")).toBe("<p>One &lt; two &amp; three.</p><p>Second paragraph,<br>second line.</p>");
    expect(reviewHtml("a\r\n\r\nb")).toBe("<p>a</p><p>b</p>");
    expect(letterboxdRow(entry({ review: "Line one\n\nLine two", rating: 0, watchedDate: "" }))).not.toMatch(/\n/);
  });

  it("starts with a header row and ends each row with a newline", () => {
    const [part] = letterboxdCsvParts([entry(), entry({ id: "b", tmdbId: "603", title: "The Matrix", year: "1999" })]);
    expect(part.csv).toBe('tmdbID,Title,Year,WatchedDate,Rating,Review\n329865,"Arrival",2016,2026-05-03,4.5,\n603,"The Matrix",1999,2026-05-03,4.5,\n');
  });

  it("gives nothing for nothing", () => {
    expect(letterboxdCsvParts([])).toEqual([]);
  });

  it("splits a long list into files under the size limit, each with the header and no film cut in two", () => {
    const entries = Array.from({ length: 50 }, (_, index) => entry({ id: `f${index}`, tmdbId: String(1000 + index), review: "é".repeat(100) }));
    const parts = letterboxdCsvParts(entries, 4000);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(new TextEncoder().encode(part.csv).length).toBeLessThanOrEqual(4000);
      expect(part.csv.startsWith("tmdbID,Title,Year,WatchedDate,Rating,Review\n")).toBe(true);
      expect(part.csv.trimEnd().split("\n").length - 1).toBe(part.entries.length);
    }
    expect(parts.flatMap((part) => part.entries.map((item) => item.id))).toEqual(entries.map((item) => item.id));
  });

  it("names the files by day, and by part when there are several", () => {
    expect(letterboxdFileName(0, 1, NOW)).toBe("flickcue-letterboxd-2026-10-09.csv");
    expect(letterboxdFileName(1, 3, NOW)).toBe("flickcue-letterboxd-2026-10-09-part-2-of-3.csv");
  });
});

describe("remembering downloads on this device", () => {
  const memory = (initial?: string) => {
    const data = new Map<string, string>(initial === undefined ? [] : [["flickcue.letterboxdSent", initial]]);
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value)
    };
  };

  it("keeps what was downloaded, and replaces a film's mark when it changes", () => {
    const store = memory();
    expect(readSent(store)).toEqual({});
    markSent([entry({ id: "a", fingerprint: "f1" })], store);
    markSent([entry({ id: "b", fingerprint: "f2" })], store);
    expect(readSent(store)).toEqual({ a: "f1", b: "f2" });
    markSent([entry({ id: "a", fingerprint: "f3" })], store);
    expect(readSent(store)).toEqual({ a: "f3", b: "f2" });
  });

  it("starts over from a damaged or foreign record, and works without storage", () => {
    expect(readSent(memory("{not json"))).toEqual({});
    expect(readSent(memory("[1,2]"))).toEqual({});
    expect(readSent(memory('{"a":"f1","b":7}'))).toEqual({ a: "f1" });
    expect(readSent(null)).toEqual({});
    expect(markSent([entry({ fingerprint: "f1" })], null)).toEqual({ a: "f1" });
    const refusing = { ...memory(), setItem: () => { throw new Error("full"); } };
    expect(() => markSent([entry()], refusing)).not.toThrow();
  });
});
