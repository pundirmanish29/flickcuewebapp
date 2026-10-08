import { describe, expect, it } from "vitest";
import { parseServiceIds, serviceLink, serviceQuery } from "./serviceLinks";

describe("a title's own page on a streaming service", () => {
  it("builds each service's page from its Wikidata ID", () => {
    const ids = { P1874: "70131314", P14440: "0OU80GSYHEGIM88LA9B3GOPU2B", P9586: "umc.cmc.6loas01ow0w4lkatxxloz7a6e", P7299: "26320" };
    expect(serviceLink("Netflix", ids)).toBe("https://www.netflix.com/title/70131314");
    expect(serviceLink("Amazon Video", ids)).toBe("https://www.primevideo.com/detail/0OU80GSYHEGIM88LA9B3GOPU2B");
    expect(serviceLink("Apple TV Store", ids)).toBe("https://tv.apple.com/movie/umc.cmc.6loas01ow0w4lkatxxloz7a6e");
    expect(serviceLink("MUBI", ids)).toBe("https://mubi.com/films/26320");
    expect(serviceLink("Crunchyroll", { P11330: "GRMG8ZQZR" })).toBe("https://www.crunchyroll.com/series/GRMG8ZQZR");
    expect(serviceLink("Apple TV Plus", { P9751: "umc.cmc.2szz3fdt71tl1ulnbp8utgq5o" })).toBe("https://tv.apple.com/show/umc.cmc.2szz3fdt71tl1ulnbp8utgq5o");
  });

  it("is nothing for a service or title it has no ID for", () => {
    expect(serviceLink("Lionsgate Play", { P1874: "1" })).toBe("");
    expect(serviceLink("Netflix", {})).toBe("");
    expect(serviceLink("Netflix", null)).toBe("");
  });

  it("asks by the TMDB number of a film or a show", () => {
    expect(serviceQuery("tv", "37854")).toContain('wdt:P4983 "37854"');
    expect(serviceQuery("movie", "680")).toContain('wdt:P4947 "680"');
  });

  it("keeps the first ID of each service and drops odd ones", () => {
    const data = { results: { bindings: [
      { prop: { value: "http://www.wikidata.org/entity/P1874" }, id: { value: "880640" } },
      { prop: { value: "http://www.wikidata.org/entity/P1874" }, id: { value: "999" } },
      { prop: { value: "http://www.wikidata.org/entity/P11330" }, id: { value: "bad id with spaces" } },
      { prop: { value: "http://www.wikidata.org/entity/P9999" }, id: { value: "x" } }
    ] } };
    expect(parseServiceIds(data)).toEqual({ P1874: "880640" });
    expect(parseServiceIds(null)).toEqual({});
  });
});
