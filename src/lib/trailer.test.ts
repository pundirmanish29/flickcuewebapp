import { describe, expect, it } from "vitest";
import { pickTrailer } from "./tmdb";

const video = (type: string, official: boolean, published: string, key: string, site = "YouTube") => ({ type, official, published_at: published, key, site, name: key });

describe("which video plays as the trailer", () => {
  it("prefers an official trailer, then any trailer, then a teaser", () => {
    const teaser = video("Teaser", true, "2026-06-13T00:00:00.000Z", "teaserteaser");
    const loose = video("Trailer", false, "2026-07-01T00:00:00.000Z", "loosetrailer");
    const official = video("Trailer", true, "2026-08-18T00:00:00.000Z", "officialtrl");
    expect(pickTrailer([teaser, loose, official])?.key).toBe("officialtrl");
    expect(pickTrailer([teaser, loose])?.key).toBe("loosetrailer");
    expect(pickTrailer([teaser])?.key).toBe("teaserteaser");
  });

  it("takes the newest of equals, whatever order TMDB lists them in", () => {
    const old = video("Trailer", true, "2022-03-02T00:00:00.000Z", "season1trail");
    const current = video("Trailer", true, "2026-08-18T00:00:00.000Z", "season6trail");
    expect(pickTrailer([old, current])?.key).toBe("season6trail");
    expect(pickTrailer([current, old])?.key).toBe("season6trail");
  });

  it("ignores clips, other sites and odd keys, and copes with nothing", () => {
    expect(pickTrailer([video("Clip", true, "2026-01-01", "clipclipclip"), video("Trailer", true, "2026-01-01", "vimeovimeo1", "Vimeo"), video("Trailer", true, "2026-01-01", "bad key!")])).toBeUndefined();
    expect(pickTrailer(undefined)).toBeUndefined();
    expect(pickTrailer([])).toBeUndefined();
  });
});
