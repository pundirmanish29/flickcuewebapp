import { describe, expect, it } from "vitest";
import { airingToday, episodeKey } from "./newEpisode";
import type { Movie } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (days: number) => {
  const date = new Date(Date.now() + days * DAY);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const show = (id: string, extra: Partial<Movie> = {}): Movie => ({
  id, title: `Show ${id}`, mediaType: "Show", tmdbType: "tv", tmdbId: "1",
  personal: { status: "watching", episodes: [] }, ...extra
});
const next = (days: number, episode = 3) => ({ nextEpisode: { season: 1, episode, airDate: isoDate(days), name: "x" } });
const last = (days: number, episode = 2) => ({ lastEpisode: { season: 1, episode, airDate: isoDate(days), name: "x" } });

describe("on tonight", () => {
  it("lists followed shows with an episode today", () => {
    const entries = airingToday([show("a", next(0)), show("b", next(2)), show("c", next(-1))], []);
    expect(entries.map((entry) => [entry.movie.id, entry.state])).toEqual([["a", "today"]]);
  });

  it("keeps an episode that came out today until it's watched or put away", () => {
    const out = show("a", last(0));
    expect(airingToday([out], []).map((entry) => entry.state)).toEqual(["out"]);
    expect(airingToday([{ ...out, personal: { status: "watching", episodes: ["1:2"] } }], [])).toEqual([]);
    expect(airingToday([out], [episodeKey("a", 1, 2)])).toEqual([]);
  });

  it("leaves out shows that aren't followed, and sorts by title", () => {
    const entries = airingToday([show("b", next(0)), show("a", next(0)), show("z", { ...next(0), personal: {} })], []);
    expect(entries.map((entry) => entry.movie.id)).toEqual(["a", "b"]);
  });
});
