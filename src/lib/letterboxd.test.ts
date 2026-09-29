import { describe, expect, it } from "vitest";
import { letterboxdHandle, letterboxdStats } from "./letterboxd";
import { knownWatchedAt } from "./rules";
import type { Movie } from "./types";

describe("Letterboxd handles", () => {
  it("accepts a username, an @handle or a profile link, as the extension does", () => {
    expect(letterboxdHandle("SoloTraveler_Cine")).toBe("solotraveler_cine");
    expect(letterboxdHandle("@dave")).toBe("dave");
    expect(letterboxdHandle("https://letterboxd.com/dave/films/")).toBe("dave");
    expect(letterboxdHandle("letterboxd.com/Dave")).toBe("dave");
  });

  it("refuses what can't be a username", () => {
    expect(letterboxdHandle("")).toBe("");
    expect(letterboxdHandle("not a name")).toBe("");
    expect(letterboxdHandle("https://example.com/dave")).toBe("");
  });
});

describe("Letterboxd numbers from the synced list", () => {
  it("counts titles, ratings, likes and reviews that came from Letterboxd", () => {
    const movies = [
      { id: "a", title: "Arrival", letterboxd: { slug: "arrival-2016", rating: 4.5, liked: true, review: "Loved it" } },
      { id: "b", title: "Heat", letterboxd: { slug: "heat", rating: 0, liked: false, review: "  " } },
      { id: "c", title: "Dune", origin: "letterboxd" },
      { id: "d", title: "Saved in Chrome" }
    ] as Movie[];
    expect(letterboxdStats(movies)).toEqual({ linked: 3, rated: 1, liked: 1, reviewed: 1 });
  });
});

describe("watched dates from Letterboxd imports", () => {
  const imported = 1_700_000_000_000;
  it("ignores the import-time stamp older extension versions wrote", () => {
    expect(knownWatchedAt({ id: "a", title: "Arrival", origin: "letterboxd", createdAt: imported, watchedAt: imported + 2000 } as Movie)).toBe(0);
  });
  it("keeps a real diary date, and dates on titles saved any other way", () => {
    expect(knownWatchedAt({ id: "a", title: "Arrival", origin: "letterboxd", createdAt: imported, watchedAt: imported - 90 * 86_400_000 } as Movie)).toBe(imported - 90 * 86_400_000);
    expect(knownWatchedAt({ id: "b", title: "Heat", createdAt: imported, watchedAt: imported + 1000 } as Movie)).toBe(imported + 1000);
  });
});
