import { describe, expect, it } from "vitest";
import { getRawShowSchedule, getShowSchedule, getShowStatus, gridBadge, setScheduleShift, watchingShows } from "./rules";
import { upNextEpisode } from "./newEpisode";
import type { Movie, ShowSchedule } from "./types";

const DAY = 24 * 60 * 60 * 1000;

// Calendar dates relative to today, the way TMDB writes them.
const isoDate = (days: number) => {
  const date = new Date(Date.now() + days * DAY);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

// A show as the Android app leaves it: its own schedule fields, no showSchedule.
const phoneShow = (extra: Partial<Movie> = {}): Movie => ({
  id: "s", title: "Severance", mediaType: "Show", tmdbType: "tv", tmdbId: "95396",
  productionStatus: "Returning Series",
  seasons: [{ number: 0, episodes: 4 }, { number: 1, episodes: 9 }, { number: 2, episodes: 10 }],
  ...extra
});

describe("a show's schedule as the phone writes it", () => {
  it("says a show only the phone looked up is airing", () => {
    const status = getShowStatus(phoneShow({
      nextEpisode: { season: 2, episode: 6, airDate: isoDate(3), name: "Attila" },
      lastEpisode: { season: 2, episode: 5, airDate: isoDate(-4) }
    }));
    expect(status?.kind).toBe("airing");
    expect(status?.tone).toBe("green");
  });

  it("reads the episode that fills its season as the finale", () => {
    expect(getShowStatus(phoneShow({ nextEpisode: { season: 2, episode: 10, airDate: isoDate(2) } }))?.text).toMatch(/^Finale/);
  });

  it("announces a dated new season", () => {
    const status = getShowStatus(phoneShow({ nextEpisode: { season: 3, episode: 1, airDate: isoDate(30) } }));
    expect(status?.kind).toBe("season");
    expect(status?.text).toMatch(/^Season 3/);
  });

  it("calls an episode that aired this week new", () => {
    expect(getShowStatus(phoneShow({ lastEpisode: { season: 2, episode: 4, airDate: isoDate(-2) } }))?.kind).toBe("new-episode");
  });

  it("says caught up once the latest episode has been watched, instead of showing a new-episode badge", () => {
    const show = phoneShow({
      lastEpisode: { season: 2, episode: 10, airDate: isoDate(-1) },
      personal: { status: "watching", episodes: ["2:10"] }
    });
    expect(getShowStatus(show)).toMatchObject({ kind: "caught-up", text: "Caught up", badge: "" });
    expect(watchingShows([show])[0].label).toBe("Caught up");
    expect(gridBadge(show)).toBeNull();
  });

  it("says an ended show has ended, with its season count", () => {
    expect(getShowStatus(phoneShow({ productionStatus: "Ended" }))?.text).toBe("Ended · 2 seasons");
  });

  it("leaves films alone and gives a bare show no schedule", () => {
    expect(getShowStatus({ id: "f", title: "Film", mediaType: "Movie", productionStatus: "Released" })).toBeNull();
    expect(getShowSchedule({ id: "x", title: "X", mediaType: "Show" })).toBeNull();
  });
});

describe("choosing between the extension's schedule and the phone's", () => {
  const extensionSchedule = (lastDays: number): ShowSchedule => ({
    status: "Returning Series", firstAirDate: "2022-02-18", seasons: 2, next: null,
    last: { date: isoDate(lastDays), season: 2, episode: 3 }
  });

  it("uses the phone's when it has seen a later episode air", () => {
    const show = phoneShow({ showSchedule: extensionSchedule(-20), lastEpisode: { season: 2, episode: 5, airDate: isoDate(-3) } });
    expect(getShowSchedule(show)?.last?.episode).toBe(5);
  });

  it("uses the extension's when it's the more recent one", () => {
    const show = phoneShow({ showSchedule: extensionSchedule(-1), lastEpisode: { season: 2, episode: 5, airDate: isoDate(-10) } });
    expect(getShowSchedule(show)?.last?.episode).toBe(3);
  });

  it("level on the last episode, prefers the one that knows what's next", () => {
    const show = phoneShow({
      showSchedule: extensionSchedule(-3),
      lastEpisode: { season: 2, episode: 3, airDate: isoDate(-3) },
      nextEpisode: { season: 2, episode: 4, airDate: isoDate(4) }
    });
    expect(getShowSchedule(show)?.next?.episode).toBe(4);
  });

  it("keeps the extension's schedule as is when the phone added nothing", () => {
    expect(getShowSchedule({ id: "s", title: "S", showSchedule: extensionSchedule(-1) })?.last?.episode).toBe(3);
  });
});

describe("episode dates on the reader's calendar", () => {
  it("normalizes Queue's raw schedule once when deciding whether the episode has aired", () => {
    const movie = phoneShow({
      personal: { status: "watching", episodes: ["2:5"] },
      lastEpisode: { season: 2, episode: 6, airDate: isoDate(-1) }
    });
    setScheduleShift(1);
    try {
      const raw = getRawShowSchedule(movie)!;
      expect(raw.last!.date).toBe(isoDate(-1));
      expect(getShowSchedule(movie)!.last!.date).toBe(isoDate(0));
      expect(upNextEpisode(movie, { ...raw.last!, name: "" }, null, [])).toMatchObject({ episode: 6, state: "new" });
      expect(movie.lastEpisode!.airDate).toBe(isoDate(-1));
    } finally { setScheduleShift(0); }
  });
  it("runs a day past TMDB's date in India, without touching the stored one", () => {
    const movie = phoneShow({ nextEpisode: { season: 2, episode: 6, airDate: isoDate(0), name: "Attila" } });
    expect(getShowSchedule(movie)?.next?.date).toBe(isoDate(0));
    setScheduleShift(1);
    try {
      expect(getShowSchedule(movie)?.next?.date).toBe(isoDate(1));
      expect(getShowStatus(movie)?.text).toMatch(/tomorrow/i);
      expect(movie.nextEpisode?.airDate).toBe(isoDate(0));
    } finally {
      setScheduleShift(0);
    }
  });
});
