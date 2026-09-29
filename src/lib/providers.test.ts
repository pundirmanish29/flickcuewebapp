import { describe, expect, it } from "vitest";
import { providerLink } from "./providers";

describe("streaming links", () => {
  it("opens the service's own search for the title, not a listings site", () => {
    expect(providerLink("Netflix", "Ocean Waves (1993)")).toBe("https://www.netflix.com/search?q=Ocean%20Waves");
    expect(providerLink("Amazon Prime Video", "Heat")).toBe("https://www.primevideo.com/search/ref=atv_nb_sug?phrase=Heat");
    expect(providerLink("JioHotstar", "Dune: Part Two")).toBe("https://www.hotstar.com/in/explore?search_query=Dune%3A%20Part%20Two");
    expect(providerLink("Apple TV Plus", "Severance")).toContain("tv.apple.com/search?term=Severance");
    expect(providerLink("Netflix Standard with Ads", "Heat")).toContain("netflix.com/search");
  });

  it("falls back to a Google search for a service it has no address for", () => {
    expect(providerLink("Disney Plus", "Heat")).toBe("https://www.google.com/search?q=watch%20%22Heat%22%20on%20Disney%20Plus");
  });
});
