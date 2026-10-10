import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { YourTake } from "./YourTake";
import { ratingSources } from "../lib/ratingSources";
import type { Movie } from "../lib/types";
vi.mock("../lib/actions", () => ({ setTake: vi.fn(), setReview: vi.fn() }));
vi.mock("../lib/motion", () => ({ pop: vi.fn() }));
const movie = (fields: Partial<Movie> = {}): Movie => ({ id: "film", title: "A Film", watched: true, ...fields });

describe("separate personal ratings", () => {
  it("shows both ratings with their sources, and keeps both reviews distinct", () => {
    const html = renderToStaticMarkup(<YourTake movie={movie({ personal: { rating: 4.5, review: "My FlickCue review" }, letterboxd: { rating: 3, review: "My Letterboxd review" } })} />);
    expect(html).toContain('aria-label="FlickCue: 4.5 out of 5 stars"');
    expect(html).toContain('aria-label="Letterboxd: 3 out of 5 stars"');
    expect(html).toContain("My FlickCue review</textarea>");
    expect(html).toContain('class="take-review">My Letterboxd review</blockquote>');
    expect((html.match(/<button[^>]*class="star /g) || [])).toHaveLength(5);
    expect(html).toContain('role="group" aria-label="Your FlickCue rating"');
  });
  it("keeps Letterboxd-only stars out of the editable FlickCue rating", () => {
    const html = renderToStaticMarkup(<YourTake movie={movie({ letterboxd: { rating: 4 } })} />);
    expect(html).toContain("Not rated on FlickCue");
    expect(html).toContain('aria-label="Letterboxd: 4 out of 5 stars"');
    expect(html).not.toContain('aria-pressed="true"');
    expect(ratingSources(movie({ letterboxd: { rating: 4 } }))).toEqual({ flickcue: 0, letterboxd: 4 });
  });
  it("shows both source labels even when the stars agree", () => {
    const html = renderToStaticMarkup(<YourTake movie={movie({ personal: { rating: 4 }, letterboxd: { rating: 4 } })} />);
    expect(html).toContain('aria-label="FlickCue: 4 out of 5 stars"');
    expect(html).toContain('aria-label="Letterboxd: 4 out of 5 stars"');
  });
  it("doesn't invent Letterboxd data for a FlickCue-only rating", () => {
    const html = renderToStaticMarkup(<YourTake movie={movie({ personal: { rating: 2.5 } })} />);
    expect(html).toContain('aria-label="FlickCue: 2.5 out of 5 stars"');
    expect(html).not.toContain("Letterboxd rating and review");
    expect(ratingSources(movie({ personal: { rating: Infinity }, letterboxd: { rating: "bad" } }))).toEqual({ flickcue: 0, letterboxd: 0 });
  });
});
