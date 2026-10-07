import { describe, expect, it } from "vitest";
import { queueDue } from "./queueDue";
import type { Movie } from "./types";
import type { TonightEntry } from "./newEpisode";

const movie = (id: string): Movie => ({ id, title: id });
const episode = (id: string): TonightEntry => ({ movie: movie(id), season: 1, episode: 2, state: "out" });

describe("due today reminders and episodes", () => {
  it("counts overlapping sources once and keeps the hero out of the shelf", () => {
    const due = queueDue([movie("hero"), movie("show"), movie("film")], [episode("show"), episode("hero")], "hero");
    expect(due.total).toBe(3);
    expect(due.remaining).toBe(2);
    expect(due.heroDue).toBe(true);
    expect(due.airing.map(entry => entry.movie.id)).toEqual(["show"]);
    expect(due.reminders.map(entry => entry.id)).toEqual(["film"]);
  });
  it("includes episode-only titles without subtracting an unrelated tonight pick", () => {
    const due = queueDue([movie("film")], [episode("show")], "unrelated");
    expect(due.total).toBe(2);
    expect(due.remaining).toBe(2);
    expect(due.heroDue).toBe(false);
  });
});
