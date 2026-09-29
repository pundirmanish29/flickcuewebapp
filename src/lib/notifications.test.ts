import { describe, expect, it } from "vitest";
import { buildNotifications, countUnread, olderReminders, stampEpisodes } from "./notifications";
import type { Movie } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const isoDate = (days: number) => {
  const date = new Date(now + days * DAY);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const film = (extra: Partial<Movie> = {}): Movie => ({ id: "f", title: "Heat", mediaType: "Movie", tmdbType: "movie", ...extra });
const show = (extra: Partial<Movie> = {}): Movie => ({
  id: "s", title: "Severance", mediaType: "Show", tmdbType: "tv", firstAirDate: undefined, releaseDate: "2022-02-18", ...extra
});

describe("notifications from the list", () => {
  it("turns a due reminder into a notification, and ignores future ones", () => {
    const items = buildNotifications([film({ remindAt: now - 60_000 }), film({ id: "g", remindAt: now + DAY })], now);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "reminder", movieId: "f", text: "Time to watch Heat" });
  });

  it("says a saved film is out once its release day arrives, for two weeks", () => {
    expect(buildNotifications([film({ releaseDate: isoDate(-3) })], now)[0]).toMatchObject({ kind: "release", text: "Heat is out now" });
    expect(buildNotifications([film({ releaseDate: isoDate(2) })], now)).toHaveLength(0);
    expect(buildNotifications([film({ releaseDate: isoDate(-30) })], now)).toHaveLength(0);
  });

  it("reports a new episode, a new season and a finale from the phone's schedule fields", () => {
    const episode = buildNotifications([show({ lastEpisode: { season: 2, episode: 5, airDate: isoDate(-2) } })], now)[0];
    expect(episode).toMatchObject({ kind: "episode", text: "New episode of Severance", detail: "S2 · E5" });
    const season = buildNotifications([show({ lastEpisode: { season: 3, episode: 1, airDate: isoDate(-1) } })], now)[0];
    expect(season).toMatchObject({ kind: "season", text: "Season 3 of Severance is here" });
    const old = buildNotifications([show({ lastEpisode: { season: 2, episode: 4, airDate: isoDate(-12) } })], now);
    expect(old).toHaveLength(0);
  });

  it("leaves watched titles out and puts the newest first", () => {
    const items = buildNotifications([
      film({ id: "a", remindAt: now - 5 * DAY }),
      film({ id: "b", remindAt: now - DAY }),
      film({ id: "c", remindAt: now - DAY, watched: true })
    ], now);
    expect(items.map((item) => item.movieId)).toEqual(["b", "a"]);
  });

  it("counts only what happened since the reader last looked", () => {
    const items = buildNotifications([film({ id: "a", remindAt: now - 5 * DAY }), film({ id: "b", remindAt: now - DAY })], now);
    expect(countUnread(items, now - 2 * DAY)).toBe(1);
    expect(countUnread(items, 0)).toBe(2);
  });

  it("says a followed show's new episode streams today, even when the show is marked watched", () => {
    const followed = show({ watched: true, productionStatus: "Returning Series", nextEpisode: { season: 6, episode: 3, airDate: isoDate(0) } });
    const items = buildNotifications([followed], now);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "episode", text: "New episode of Severance streams today", detail: "S6 · E3", id: "episode:s:S6E3" });
    // The same episode, once the schedule calls it the latest, stays one notification.
    const both = buildNotifications([{ ...followed, lastEpisode: { season: 6, episode: 3, airDate: isoDate(0) } }], now);
    expect(both).toHaveLength(1);
  });

  it("stays quiet about watched shows that have ended, and about their reminders", () => {
    const ended = show({ watched: true, productionStatus: "Ended", lastEpisode: { season: 5, episode: 16, airDate: isoDate(-1) } });
    expect(buildNotifications([ended], now)).toHaveLength(0);
    const followed = show({ watched: true, productionStatus: "Returning Series", remindAt: now - DAY });
    expect(buildNotifications([followed], now)).toHaveLength(0);
  });

  it("dates episode news from when it was first seen, after the first run", () => {
    const store = new Map<string, string>();
    Object.assign(globalThis, {
      localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) }
    });
    const old = buildNotifications([show({ lastEpisode: { season: 2, episode: 5, airDate: isoDate(-2) } })], now);
    // First run: kept as it was.
    expect(stampEpisodes(old, now)[0].at).toBe(old[0].at);
    const fresh = buildNotifications([show({ id: "t", lastEpisode: { season: 1, episode: 2, airDate: isoDate(-1) } })], now);
    const stamped = stampEpisodes([...old, ...fresh], now);
    const t = stamped.find((item) => item.movieId === "t")!;
    expect(t.at).toBe(now);
    expect(t.airedAt).toBe(fresh[0].at);
  });

  it("leaves reminders overdue more than two weeks out of the list, and counts them", () => {
    const old = film({ id: "o", remindAt: now - 20 * DAY });
    const fresh = film({ id: "n", remindAt: now - DAY });
    expect(buildNotifications([old, fresh], now).map((item) => item.movieId)).toEqual(["n"]);
    expect(olderReminders([old, fresh], now)).toBe(1);
  });

  it("names the title first, then what happened", () => {
    const item = buildNotifications([show({ lastEpisode: { season: 3, episode: 1, airDate: isoDate(-1) } })], now)[0];
    expect([item.title, item.event]).toEqual(["Severance", "Season 3 is here"]);
  });
});
