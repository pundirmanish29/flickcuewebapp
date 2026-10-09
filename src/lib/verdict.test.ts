import { describe, expect, it } from "vitest";
import { verdictLabel, verdictOf } from "./verdict";

describe("verdicts", () => {
  it("reads stars as a verdict", () => {
    expect(verdictOf(0)).toBeNull();
    expect(verdictOf(undefined)).toBeNull();
    expect([0.5, 1, 1.5].map(verdictOf)).toEqual(["skip", "skip", "skip"]);
    expect([2, 2.5, 3].map(verdictOf)).toEqual(["timepass", "timepass", "timepass"]);
    expect([3.5, 4].map(verdictOf)).toEqual(["go", "go"]);
    expect([4.5, 5].map(verdictOf)).toEqual(["perfection", "perfection"]);
  });

  it("names them", () => {
    expect(verdictLabel("go")).toBe("Go for it");
  });
});
