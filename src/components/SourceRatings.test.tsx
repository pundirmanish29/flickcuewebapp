import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceRatings } from "./SourceRatings";
import type { Movie } from "../lib/types";

const film = (fields: Partial<Movie> = {}): Movie => ({ id: "film", title: "A Film", ...fields });
describe("source logos on cards", () => {
  it("shows both original ratings beside separate named logos, even when they agree", () => {
    const html = renderToStaticMarkup(<SourceRatings movie={film({ personal: { rating: 4 }, letterboxd: { rating: 4 } })} />);
    expect(html).toContain('aria-label="FlickCue: 4 out of 5 stars"');
    expect(html).toContain('aria-label="Letterboxd: 4 out of 5 stars"');
    expect(html).toContain('source-flickcue');
    expect(html).toContain('source-letterboxd');
    expect(html).not.toContain("<select");
  });
  it("keeps the rating attached to its actual source without inventing another", () => {
    const html = renderToStaticMarkup(<SourceRatings movie={film({ letterboxd: { rating: 2.5 }, rating: "9.5" })} />);
    expect(html).toContain('aria-label="Letterboxd: 2.5 out of 5 stars"');
    expect(html).not.toContain("source-flickcue");
    expect(renderToStaticMarkup(<SourceRatings movie={film({ rating: "9.5" })} />)).toBe("");
  });
});
