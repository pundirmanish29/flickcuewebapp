import { describe, expect, it } from "vitest";
import { scoreOf } from "./score";

describe("score bands", () => {
  it("bands a ten-point rating", () => {
    expect(scoreOf("8.4")).toEqual({ tier: "great", word: "Loved" });
    expect(scoreOf(8)?.tier).toBe("great");
    expect(scoreOf("7.6")).toEqual({ tier: "good", word: "Well liked" });
    expect(scoreOf(7)?.tier).toBe("good");
    expect(scoreOf(6.9)?.tier).toBe("mixed");
    expect(scoreOf(5.5)?.tier).toBe("mixed");
    expect(scoreOf(5.4)).toEqual({ tier: "poor", word: "Weak" });
  });

  it("says nothing without a rating", () => {
    expect(scoreOf("")).toBeNull();
    expect(scoreOf(0)).toBeNull();
    expect(scoreOf(undefined)).toBeNull();
  });
});
