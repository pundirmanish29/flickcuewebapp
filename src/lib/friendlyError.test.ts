import { describe, expect, it } from "vitest";
import { lookupErrorText, syncErrorText } from "./friendlyError";

describe("friendly errors", () => {
  it("turns the browser's network failures into a sentence", () => {
    for (const raw of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      expect(syncErrorText(raw)).toMatch(/Couldn't reach Google Drive/);
      expect(lookupErrorText(raw)).toMatch(/Couldn't reach FlickCue's title service/);
    }
  });
  it("keeps a message that already says what happened", () => {
    expect(syncErrorText("Google needs you to sign in again.")).toBe("Google needs you to sign in again.");
    expect(syncErrorText(undefined)).toBe("");
  });
});
