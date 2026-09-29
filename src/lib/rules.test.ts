import { describe, expect, it } from "vitest";
import { shortDay } from "./rules";

describe("short day labels", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  it("fits a small label", () => {
    expect(shortDay(new Date(2026, 8, 29, 21, 0).getTime(), now)).toMatch(/9:00/);
    expect(shortDay(new Date(2026, 8, 29).getTime(), now, false)).toBe("Today");
    expect(shortDay(new Date(2026, 8, 30, 9, 0).getTime(), now)).toBe("Tomorrow");
    expect(shortDay(new Date(2026, 9, 2, 9, 0).getTime(), now)).toBe(new Date(2026, 9, 2).toLocaleDateString(undefined, { weekday: "short" }));
    expect(shortDay(new Date(2026, 9, 13, 9, 0).getTime(), now)).toBe(new Date(2026, 9, 13).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  });
});
