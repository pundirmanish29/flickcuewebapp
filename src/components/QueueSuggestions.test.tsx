import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Movie } from "../lib/types";
import { QueueSuggestions } from "./QueueSuggestions";

vi.mock("./TitleCard", () => ({ TitleCard: ({ movie }: { movie: Movie }) => <article data-id={movie.id}>{movie.title}</article> }));

describe("saved queue picks", () => {
  it("renders released queued movies in one row, including manual saves, without external suggestions or add buttons", () => {
    const movies = [
      { id: "saved", title: "Saved Film", tmdbId: "1", tmdbType: "movie" },
      { id: "manual", title: "My hand-added film", mediaType: "Movie" },
      { id: "watched", title: "Already watched", watched: true },
      { id: "show", title: "Queued show", tmdbType: "tv" },
      { id: "soon", title: "Unreleased movie", releaseDate: "2999-12-16", upcoming: false }
    ];
    const html = renderToStaticMarkup(<QueueSuggestions movies={movies} onOpen={() => {}} />);
    expect(html).toContain('class="queue-picks-row"');
    expect(html).toContain('data-id="saved"');
    expect(html).toContain('data-id="manual"');
    expect(html).not.toContain("Already watched");
    expect(html).not.toContain("Queued show");
    expect(html).not.toContain("Unreleased movie");
    expect(html).not.toContain("More suggestions");
    expect(html).not.toContain("Because you saved");
    expect((html.match(/<article /g) || [])).toHaveLength(2);
  });
  it("hides the row when no queued movies remain", () => {
    expect(renderToStaticMarkup(<QueueSuggestions movies={[{ id: "seen", title: "Seen", watched: true }]} onOpen={() => {}} />)).toBe("");
  });
  it("hides the row when every saved movie is upcoming", () => {
    expect(renderToStaticMarkup(<QueueSuggestions movies={[{ id: "soon", title: "Coming soon", upcoming: true }]} onOpen={() => {}} />)).toBe("");
  });
});
