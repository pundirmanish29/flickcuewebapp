import { describe, expect, it } from "vitest";
import { safeImage, safeImdbId, safeLink, safeTmdbId } from "./safe";

describe("values from Drive", () => {
  it("keeps TMDB images and drops any other address", () => {
    expect(safeImage("https://image.tmdb.org/t/p/w342/abc123.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc123.jpg");
    expect(safeImage("https://evil.example/pixel.gif")).toBe("");
    expect(safeImage("https://image.tmdb.org/t/p/w342/a.jpg) , url(https://evil.example/x")).toBe("");
    expect(safeImage("javascript:alert(1)")).toBe("");
  });
  it("keeps web links and ids that look right", () => {
    expect(safeLink("https://www.imdb.com/title/tt0113277/")).toBe("https://www.imdb.com/title/tt0113277/");
    expect(safeLink("javascript:alert(1)")).toBe("");
    expect(safeTmdbId("949")).toBe("949");
    expect(safeTmdbId("949/../../account")).toBe("");
    expect(safeImdbId("tt0113277")).toBe("tt0113277");
    expect(safeImdbId("tt1\" onerror")).toBe("");
  });
});
