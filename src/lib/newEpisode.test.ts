import { describe, expect, it } from "vitest";
import { episodeKey, newEpisodeFor } from "./newEpisode";
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
