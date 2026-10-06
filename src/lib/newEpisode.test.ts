import { describe, expect, it } from "vitest";
import { episodeKey, newEpisodeFor, upNextEpisode } from "./newEpisode";
import type { Movie } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (days: number) => {
  const date = new Date(Date.now() + days * DAY);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const show = (extra: Partial<Movie> = {}): Movie => ({
  id: "s", title: "Slow Horses", mediaType: "Show", tmdbType: "tv", tmdbId: "95480",
  personal: { status: "watching", episodes: ["1:1"] },
  ...extra
});
const aired = (days: number, episode = 2) => ({ season: 1, episode, name: "Two", date: isoDate(days) });

describe("the new episode kept in front", () => {
  it("shows the latest aired episode of a show being followed", () => {
    expect(newEpisodeFor(show(), aired(-1), [])?.episode).toBe(2);
    expect(newEpisodeFor(show(), aired(0), [])?.episode).toBe(2);
  });

  it("waits for an episode that hasn't aired", () => {
    expect(newEpisodeFor(show(), aired(2), [])).toBeNull();
  });

  it("stops once the episode is watched or put away", () => {
    expect(newEpisodeFor(show({ personal: { status: "watching", episodes: ["1:1", "1:2"] } }), aired(-1), [])).toBeNull();
    expect(newEpisodeFor(show(), aired(-1), [episodeKey("s", 1, 2)])).toBeNull();
    // Putting away one episode doesn't hide the next.
    expect(newEpisodeFor(show(), aired(-1, 3), [episodeKey("s", 1, 2)])?.episode).toBe(3);
  });

  it("leaves shows that aren't being followed alone", () => {
    expect(newEpisodeFor(show({ personal: {} }), aired(-1), [])).toBeNull();
    expect(newEpisodeFor(show(), null, [])).toBeNull();
  });
});

describe("the episode up next", () => {
  // Slow Horses, season 6: E1 Sep 17, E2, E3 out; E4 airs in two days.
  const followed = (episodes: string[]) => show({
    personal: { status: "watching", episodes },
    seasons: [{ number: 5, episodes: 6 }, { number: 6, episodes: 6 }]
  });
  const last = { season: 6, episode: 3, name: "Resurrection", date: isoDate(-5) };
  const next = { season: 6, episode: 4, name: "Four", date: isoDate(2) };

  it("is the latest aired episode for a reader who's up to it", () => {
    expect(upNextEpisode(followed(["6:1", "6:2"]), last, next, [])).toMatchObject({ season: 6, episode: 3, state: "new" });
  });

  it("moves on to the next one to air once the latest is watched", () => {
    expect(upNextEpisode(followed(["6:1", "6:2", "6:3"]), last, next, [])).toMatchObject({ season: 6, episode: 4, state: "upcoming", date: next.date });
  });

  it("moves on to the next one to air once the latest is put away", () => {
    expect(upNextEpisode(followed(["6:1", "6:2"]), last, next, [episodeKey("s", 6, 3)])).toMatchObject({ episode: 4, state: "upcoming" });
  });

  it("is the one after the furthest watched while catching up", () => {
    expect(upNextEpisode(followed(["6:1"]), last, next, [])).toMatchObject({ season: 6, episode: 2, state: "next" });
    // Across a season's end.
    expect(upNextEpisode(followed(["5:6"]), last, next, [])).toMatchObject({ season: 6, episode: 1, state: "next" });
  });

  it("skips a caught-up episode that was put away, to the latest", () => {
    expect(upNextEpisode(followed(["6:1"]), last, next, [episodeKey("s", 6, 2)])).toMatchObject({ episode: 3, state: "new" });
  });

  it("is nothing when caught up with no date for the next", () => {
    expect(upNextEpisode(followed(["6:1", "6:2", "6:3"]), last, null, [])).toBeNull();
  });

  it("leaves shows that aren't being followed alone", () => {
    expect(upNextEpisode(show({ personal: {} }), last, next, [])).toBeNull();
  });
});
