import { describe, expect, it } from "vitest";
import { readSynced, settingsDirection, type SyncedSettings } from "./settingsSync";

const here: SyncedSettings = { region: "IN", city: "delhi", letterboxd: "", letterboxdUnlinked: false, theme: "system" };

describe("settings sync", () => {
  it("takes the newer side", () => {
    expect(settingsDirection(0, null)).toBe("push");
    expect(settingsDirection(0, { updatedAt: 5 })).toBe("pull");
    expect(settingsDirection(9, { updatedAt: 5 })).toBe("push");
    expect(settingsDirection(5, { updatedAt: 5 })).toBe("none");
  });

  it("reads only well-formed values from Drive", () => {
    expect(readSynced({ region: "US", city: "Austin", letterboxd: "manish", letterboxdUnlinked: false, theme: "dark" }, here))
      .toEqual({ region: "US", city: "Austin", letterboxd: "manish", letterboxdUnlinked: false, theme: "dark" });
    expect(readSynced({ region: "usa", theme: "neon", city: 4 }, here)).toEqual(here);
  });
});
