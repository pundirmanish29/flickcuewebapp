import { describe, expect, it } from "vitest";
import { resolveCity, showtimeLinks } from "./cinemas";
import { buildNotifications } from "./notifications";
import type { Movie } from "./types";

describe("showtime links", () => {
  it("links Google, BookMyShow and District for a listed city", () => {
    const links = showtimeLinks("Kantara: Chapter 1 (2025)", "2025", resolveCity("delhi-ncr"), "India");
    expect(links.map((link) => link.label)).toEqual(["Google", "BookMyShow", "District"]);
    expect(links[0].url).toBe("https://www.google.com/search?q=Kantara%3A%20Chapter%201%202025%20showtimes%20in%20Delhi%20NCR");
    expect(links[1].url).toBe("https://in.bookmyshow.com/explore/movies-national-capital-region-ncr");
    expect(links[2].url).toBe("https://www.district.in/movies/delhi-ncr-movie-tickets");
  });

  it("gives only Google for a smaller listed city without a known BookMyShow page", () => {
    expect(showtimeLinks("Coolie", "2025", resolveCity("vizag"), "India").map((link) => link.label)).toEqual(["Google", "District"]);
  });

  it("uses a typed city, or the region when no city is set", () => {
    expect(resolveCity("Shimla")).toEqual({ id: "Shimla", name: "Shimla" });
    expect(showtimeLinks("Coolie", "", resolveCity("Shimla"), "India")[0].url).toContain("showtimes%20in%20Shimla");
    const none = showtimeLinks("Coolie", "", resolveCity(""), "India");
    expect(none).toHaveLength(1);
    expect(none[0].url).toContain("showtimes%20in%20India");
  });
});

describe("in-cinemas notifications", () => {
  const film = (extra: Partial<Movie> = {}): Movie => ({ id: "k", title: "Kantara", mediaType: "Movie", tmdbType: "movie", tmdbId: "42", ...extra });

  it("says a saved film is in cinemas where the reader is, instead of 'out now'", () => {
    const now = Date.now();
    const items = buildNotifications([film({ releaseDate: "2025-10-02" })], now, { keys: new Set(["tmdb:movie:42"]), firstSeen: { "tmdb:movie:42": now - 5000 }, place: "Delhi NCR" });
    expect(items).toEqual([expect.objectContaining({ kind: "cinema", text: "Kantara is in cinemas", detail: "Showing in Delhi NCR", at: now - 5000 })]);
  });

  it("leaves out watched films and films not in cinemas", () => {
    const cinema = { keys: new Set(["tmdb:movie:42"]), firstSeen: {}, place: "India" };
    expect(buildNotifications([film({ watched: true })], Date.now(), cinema)).toHaveLength(0);
    expect(buildNotifications([film({ tmdbId: "7" })], Date.now(), cinema)).toHaveLength(0);
  });
});
