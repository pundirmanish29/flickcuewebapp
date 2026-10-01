import { describe, expect, it } from "vitest";
import { readSynced, settingsDirection, SYNCED_KEYS, type SyncedSettings } from "./settingsSync";

const here: SyncedSettings = { region: "IN", city: "delhi", letterboxd: "", letterboxdUnlinked: false, theme: "system", sort: "added", language: "en-US", calendarMirror: false, calendarId: "" };

describe("settings sync", () => {
  it("takes the newer side", () => {
    expect(settingsDirection(0, null)).toBe("push");
    expect(settingsDirection(0, { updatedAt: 5 })).toBe("pull");
    expect(settingsDirection(9, { updatedAt: 5 })).toBe("push");
    expect(settingsDirection(5, { updatedAt: 5 })).toBe("none");
  });

  it("reads only well-formed values from Drive", () => {
    expect(readSynced({ region: "US", city: "Austin", letterboxd: "manish", letterboxdUnlinked: false, theme: "dark", sort: "rating" }, here))
      .toEqual({ region: "US", city: "Austin", letterboxd: "manish", letterboxdUnlinked: false, theme: "dark", sort: "rating", language: "en-US", calendarMirror: false, calendarId: "" });
    expect(readSynced({ region: "usa", theme: "neon", city: 4, sort: "random" }, here)).toEqual(here);
  });

  it("carries the Calendar switch and the calendar's id between devices", () => {
    const remote = { calendarMirror: true, calendarId: "abc123@group.calendar.google.com" };
    expect(readSynced(remote, here)).toEqual({ ...here, ...remote });
    expect(readSynced({ calendarId: "" }, { ...here, calendarId: "old@group.calendar.google.com" }).calendarId).toBe("");
  });

  it("ignores a Calendar switch or id that isn't well formed", () => {
    const mine = { ...here, calendarMirror: true, calendarId: "mine@group.calendar.google.com" };
    expect(readSynced({ calendarMirror: "yes", calendarId: 7 }, mine)).toEqual(mine);
    for (const bad of ["has space", "semi;colon", "slash/ed", "x".repeat(201), "<script>"]) {
      expect(readSynced({ calendarId: bad }, mine).calendarId).toBe(mine.calendarId);
    }
  });

  it("syncs both keys, so changing one pushes the settings", () => {
    expect(SYNCED_KEYS).toContain("calendarMirror");
    expect(SYNCED_KEYS).toContain("calendarId");
  });
});
