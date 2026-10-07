// Vitest runs this integration fixture in Node; the browser app does not include Node types.
// @ts-expect-error Node is provided by the test runner.
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error Node is provided by the test runner.
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { getShowSchedule, getShowStatus, setScheduleShift } from "./rules";
import { airDateShiftDays } from "./regions";
import type { Movie } from "./types";

const extensionPath = new URL("../../../flickcueextension/shared.js", import.meta.url);
// Standalone web CI has no sibling extension checkout; this integration suite
// runs when both repositories are present, as in the development workspace.
const hasExtension = existsSync(extensionPath);
const source = hasExtension ? readFileSync(extensionPath, "utf8") : "";
const extension = hasExtension ? runInNewContext(`${source}\n({ getShowSchedule, getShowStatus, setScheduleRegion });`, { Date, console }) : null;
const now = new Date(2026, 9, 7, 12).getTime();
const movie: Movie = {
  id: "parity", title: "A show", tmdbType: "tv", mediaType: "Show",
  showSchedule: {
    status: "Returning Series", next: { date: "2026-10-07", season: 1, episode: 2 },
    last: { date: "2026-10-06", season: 1, episode: 1 }
  }
};
afterEach(() => setScheduleShift(0));
describe.skipIf(!hasExtension)("web and extension schedule parity", () => {
  for (const region of ["IN", "US", "GB"]) {
    it(`uses the same dates and episode status in ${region}`, () => {
      setScheduleShift(airDateShiftDays(region));
      extension.setScheduleRegion(region);
      expect(JSON.parse(JSON.stringify(extension.getShowSchedule(movie)))).toEqual(getShowSchedule(movie));
      const web = getShowStatus(movie, now);
      const addon = extension.getShowStatus(movie, now);
      expect(addon).toMatchObject({ kind: web?.kind, text: web?.text, badge: web?.badge });
      expect(movie.showSchedule?.next?.date).toBe("2026-10-07");
    });
  }
});
