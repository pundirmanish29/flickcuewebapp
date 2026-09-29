import { describe, expect, it } from "vitest";
import { pickCertification } from "./tmdb";

describe("age rating", () => {
  const film = {
    release_dates: {
      results: [
        { iso_3166_1: "US", release_dates: [{ type: 3, certification: "R" }] },
        { iso_3166_1: "IN", release_dates: [{ type: 1, certification: "" }, { type: 3, certification: "UA 16+" }] }
      ]
    }
  };

  it("uses the region's theatrical rating for a film", () => {
    expect(pickCertification(film, "movie", "in")).toBe("UA 16+");
  });

  it("falls back to the US rating when the region has none", () => {
    expect(pickCertification(film, "movie", "GB")).toBe("R");
  });

  it("reads a show's content rating the same way", () => {
    const show = { content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }, { iso_3166_1: "IN", rating: " " }] } };
    expect(pickCertification(show, "tv", "IN")).toBe("TV-MA");
  });

  it("is empty when nothing is rated", () => {
    expect(pickCertification({}, "movie", "IN")).toBe("");
  });
});
