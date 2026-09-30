import { describe, expect, it } from "vitest";
import { pickSharpBackdrop } from "./tmdb";

const backdrop = (file_path: string, width: number, vote_average = 5, aspect_ratio = 1.778) => ({ file_path, width, vote_average, aspect_ratio });

describe("pickSharpBackdrop", () => {
  it("keeps the title's own backdrop when it is already sharp", () => {
    const list = [backdrop("/own.jpg", 3840, 5), backdrop("/other.jpg", 3840, 9)];
    expect(pickSharpBackdrop(list, "/own.jpg")).toBe("/own.jpg");
  });

  it("swaps to the best-rated wide one when its own is small", () => {
    const list = [backdrop("/own.jpg", 1280, 8), backdrop("/a.jpg", 1920, 5), backdrop("/b.jpg", 3840, 7)];
    expect(pickSharpBackdrop(list, "/own.jpg")).toBe("/b.jpg");
  });

  it("ignores pictures that aren't wide screen shaped", () => {
    const list = [backdrop("/own.jpg", 1280), backdrop("/tall.jpg", 3840, 9, 0.9)];
    expect(pickSharpBackdrop(list, "/own.jpg")).toBe("/own.jpg");
  });

  it("falls back to nothing when the list is empty or unusable", () => {
    expect(pickSharpBackdrop([], "/own.jpg")).toBe("");
    expect(pickSharpBackdrop([{ file_path: "https://evil.example/x.jpg", width: 4000, aspect_ratio: 1.78 }], "")).toBe("");
    expect(pickSharpBackdrop([{ file_path: "/a/../b.jpg", width: 4000, aspect_ratio: 1.78 }], "")).toBe("");
  });
});
