import { describe, expect, it } from "vitest";
import { pickBackdropMatch } from "./tmdb";
import type { Candidate } from "./types";

const result = (title: string, year: string, tmdbType: "movie" | "tv", backdrop = "https://image.tmdb.org/t/p/w780/x.jpg"): Candidate => ({
  key: `tmdb:${tmdbType}:${title}${year}`, title: `${title} (${year})`, year, mediaType: tmdbType === "tv" ? "Show" : "Movie", tmdbType,
  tmdbId: "1", releaseDate: "", overview: "", rating: "", poster: "", backdrop, upcoming: false
});

describe("pickBackdropMatch", () => {
  it("finds a show by its name and year", () => {
    const list = [result("One Piece", "2023", "tv", "/new"), result("One Piece", "1999", "tv", "/old"), result("One Piece", "2012", "movie")];
    expect(pickBackdropMatch(list, { title: "One Piece", year: "1999", mediaType: "Show" })?.backdrop).toBe("/old");
  });

  it("keeps films and shows apart", () => {
    const list = [result("Dune", "2021", "movie")];
    expect(pickBackdropMatch(list, { title: "Dune", year: "2021", mediaType: "Show" })).toBeUndefined();
    expect(pickBackdropMatch(list, { title: "Dune", year: "2021", mediaType: "Movie" })).toBeDefined();
  });

  it("allows a year's difference, as release dates differ by region, but no more", () => {
    const list = [result("Arrival", "2016", "movie")];
    expect(pickBackdropMatch(list, { title: "Arrival", year: "2017", mediaType: "Movie" })).toBeDefined();
    expect(pickBackdropMatch(list, { title: "Arrival", year: "2010", mediaType: "Movie" })).toBeUndefined();
  });

  it("ignores punctuation, case and a year typed into the title", () => {
    const list = [result("Spider-Man: Homecoming", "2017", "movie")];
    expect(pickBackdropMatch(list, { title: "spider man homecoming (2017)", year: "2017", mediaType: "Movie" })).toBeDefined();
  });

  it("does not borrow the picture of a different title", () => {
    const list = [result("One Piece Film: Red", "2022", "movie")];
    expect(pickBackdropMatch(list, { title: "One Piece", year: "1999", tmdbType: "tv", mediaType: "Show" })).toBeUndefined();
  });

  it("skips results with no backdrop", () => {
    expect(pickBackdropMatch([result("Heat", "1995", "movie", "")], { title: "Heat", year: "1995", mediaType: "Movie" })).toBeUndefined();
  });

  it("still matches when the saved title has no year", () => {
    expect(pickBackdropMatch([result("Heat", "1995", "movie")], { title: "Heat", mediaType: "Movie" })).toBeDefined();
  });
});

describe("pickBackdropMatch names", () => {
  it("tells different names apart (guards the name normaliser itself)", () => {
    const list = [result("Heat", "1995", "movie")];
    expect(pickBackdropMatch(list, { title: "Ted Lasso", year: "1995", mediaType: "Movie" })).toBeUndefined();
  });

  it("keeps non-Latin names distinct", () => {
    const list = [result("千と千尋の神隠し", "2001", "movie")];
    expect(pickBackdropMatch(list, { title: "千と千尋の神隠し", year: "2001", mediaType: "Movie" })).toBeDefined();
    expect(pickBackdropMatch(list, { title: "もののけ姫", year: "2001", mediaType: "Movie" })).toBeUndefined();
  });
});
