import { describe, expect, it } from "vitest";
import { buildNotifications, countUnread } from "./notifications";
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
});
