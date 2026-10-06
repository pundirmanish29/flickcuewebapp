import { describe, expect, it } from "vitest";
import { EXTENSION_URL, FIREFOX_EXTENSION_URL } from "./config";
import { extensionStore } from "./extensionStore";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/128.0.0.0`;
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("extensionStore", () => {
  it("points Firefox at Firefox Add-ons", () => {
    expect(extensionStore(FIREFOX)).toEqual({ browser: "Firefox", url: FIREFOX_EXTENSION_URL });
  });

  it("points Chrome, Edge and anything else at the Chrome Web Store", () => {
    for (const agent of [CHROME, EDGE, SAFARI, ""]) expect(extensionStore(agent)).toEqual({ browser: "Chrome", url: EXTENSION_URL });
  });

  it("links to the real add-on page", () => {
    expect(FIREFOX_EXTENSION_URL).toBe("https://addons.mozilla.org/en-US/firefox/addon/flickcue/");
  });
});
