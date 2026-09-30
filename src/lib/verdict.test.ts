import { describe, expect, it } from "vitest";
import { starsForTap, verdictLabel, verdictOf } from "./verdict";

describe("verdicts", () => {
  it("reads stars as a verdict", () => {
    expect(verdictOf(0)).toBeNull();
    expect(verdictOf(undefined)).toBeNull();
    expect([0.5, 1, 1.5].map(verdictOf)).toEqual(["skip", "skip", "skip"]);
    expect([2, 2.5, 3].map(verdictOf)).toEqual(["timepass", "timepass", "timepass"]);
    expect([3.5, 4].map(verdictOf)).toEqual(["go", "go"]);
    expect([4.5, 5].map(verdictOf)).toEqual(["perfection", "perfection"]);
  });

  it("saves a verdict's stars, and clears it when tapped again", () => {
    expect(starsForTap("go", 0)).toBe(4);
    expect(starsForTap("perfection", 3)).toBe(5);
    expect(starsForTap("go", 4)).toBe(0);
    // A Letterboxd 3.5 is already "Go for it", so tapping it clears rather than re-saves.
    expect(starsForTap("go", 3.5)).toBe(0);
  });

  it("names them", () => {
    expect(verdictLabel("go")).toBe("Go for it");
  });
});
