import { describe, expect, it } from "vitest";
import { appLink, dedupeProviders, providerLink, splitChannel } from "./providers";

describe("streaming links", () => {
  it("opens the service's own search for the title, not a listings site", () => {
    expect(providerLink("Netflix", "Ocean Waves (1993)")).toBe("https://www.netflix.com/search?q=Ocean%20Waves");
    expect(providerLink("Amazon Prime Video", "Heat")).toBe("https://www.primevideo.com/search/ref=atv_nb_sug?phrase=Heat");
    expect(providerLink("JioHotstar", "Dune: Part Two")).toBe("https://www.hotstar.com/in/explore?search_query=Dune%3A%20Part%20Two");
    expect(providerLink("Apple TV Plus", "Severance")).toContain("tv.apple.com/search?term=Severance");
    expect(providerLink("Netflix Standard with Ads", "Heat")).toContain("netflix.com/search");
  });

  it("opens the service's own search page when it can't take the title", () => {
    expect(providerLink("Lionsgate Play", "Normal People")).toBe("https://www.lionsgateplay.com/search");
    expect(providerLink("Lionsgate Play Amazon Channel", "Normal People")).toBe("https://www.lionsgateplay.com/search");
  });

  it("falls back to a Google search for a service it has no address for", () => {
    expect(providerLink("Disney Plus", "Heat")).toBe("https://www.google.com/search?q=watch%20%22Heat%22%20on%20Disney%20Plus");
  });
});

describe("opening the service's app", () => {
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

  it("names the app on Android, with the website as the fallback", () => {
    expect(appLink("Netflix", "Heat", android)).toBe(
      "intent://www.netflix.com/search?q=Heat#Intent;scheme=https;package=com.netflix.mediaclient;S.browser_fallback_url=https%3A%2F%2Fwww.netflix.com%2Fsearch%3Fq%3DHeat;end"
    );
    expect(appLink("Amazon Video", "Heat", android)).toContain("package=com.amazon.avod.thirdpartyclient");
    expect(appLink("Crunchyroll", "One Piece", android)).toContain("intent://www.crunchyroll.com/search?q=One%20Piece#Intent");
  });

  it("leaves the plain link on an iPhone and a computer, where the service's own link opens its app", () => {
    expect(appLink("Netflix", "Heat", iphone)).toBe("https://www.netflix.com/search?q=Heat");
    expect(appLink("Netflix", "Heat", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("https://www.netflix.com/search?q=Heat");
  });

  it("leaves services without a known app, and the Google fallback, as plain links", () => {
    expect(appLink("Apple TV Store", "Heat", android)).toBe("https://tv.apple.com/search?term=Heat");
    expect(appLink("Disney Plus", "Heat", android)).toContain("https://www.google.com/search");
  });
});

describe("service list", () => {
  it("drops channel and ad-tier variants of a service that is already listed", () => {
    const names = ["Amazon Prime Video", "Lionsgate Play", "Lionsgate Play Apple TV Channel", "Lionsgate Play Amazon Channel", "Amazon Prime Video with Ads", "Lionsgate+ Amazon Channel"];
    expect(dedupeProviders(names.map((name) => ({ name }))).map((provider) => provider.name))
      .toEqual(["Amazon Prime Video", "Lionsgate Play", "Lionsgate+ Amazon Channel"]);
  });
});

describe("channel names", () => {
  it("names the service and how it's reached", () => {
    expect(splitChannel("Lionsgate+ Amazon Channels")).toEqual(["Lionsgate+", "via Prime Video"]);
    expect(splitChannel("MUBI Apple TV Channel")).toEqual(["MUBI", "via Apple TV"]);
    expect(splitChannel("Netflix")).toEqual(["Netflix", ""]);
  });
});
