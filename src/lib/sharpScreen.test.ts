import { describe, expect, it } from "vitest";
import { SHARP_FROM_PIXELS, wantsSharpPicture } from "./sharpScreen";

describe("the original-size backdrop", () => {
  it("is for screens the 1280-wide copy can't fill", () => {
    expect(wantsSharpPicture({ ratio: 1, width: 1920 })).toBe(true);
    expect(wantsSharpPicture({ ratio: 2, width: 1440 })).toBe(true);
    expect(wantsSharpPicture({ ratio: 1.25, width: 1536 })).toBe(true);
  });

  it("isn't for a laptop or phone screen the smaller copy fills", () => {
    expect(wantsSharpPicture({ ratio: 1, width: 1440 })).toBe(false);
    expect(wantsSharpPicture({ ratio: 1, width: 1366 })).toBe(false);
    expect(wantsSharpPicture({ ratio: 3, width: 390 })).toBe(false);
    expect(wantsSharpPicture({ ratio: 1, width: SHARP_FROM_PIXELS })).toBe(false);
  });

  it("isn't for a connection that is saving data or slow", () => {
    expect(wantsSharpPicture({ ratio: 1, width: 2560, saveData: true })).toBe(false);
    for (const effectiveType of ["slow-2g", "2g", "3g"]) expect(wantsSharpPicture({ ratio: 1, width: 2560, effectiveType })).toBe(false);
    expect(wantsSharpPicture({ ratio: 1, width: 2560, effectiveType: "4g" })).toBe(true);
  });

  it("isn't fetched for a page that a title page is covering", () => {
    expect(wantsSharpPicture({ ratio: 2, width: 1920, covered: true })).toBe(false);
  });

  it("counts a ratio above 2 as 2, and a missing one as 1", () => {
    expect(wantsSharpPicture({ ratio: 4, width: 700 })).toBe(false);
    expect(wantsSharpPicture({ ratio: 0, width: 1700 })).toBe(true);
  });
});
