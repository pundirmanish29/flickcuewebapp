import { beforeEach, describe, expect, it, vi } from "vitest";
import { directLink, fetchStreamSources, parseStreamSources, streamLink, type StreamSource } from "./streamLinks";

const netflix: StreamSource = { name: "Netflix", type: "sub", url: "https://www.netflix.com/title/70143836" };
const primeRent: StreamSource = { name: "Amazon Prime", type: "rent", url: "https://www.primevideo.com/detail/0RENT" };
const primeSub: StreamSource = { name: "Amazon Prime", type: "sub", url: "https://www.primevideo.com/detail/0SUB" };
const crunchy: StreamSource = { name: "Crunchyroll", type: "sub", url: "https://www.crunchyroll.com/series/GRMG8ZQZR" };

describe("a service's page from Watchmode", () => {
  it("is the source on that service's own website", () => {
    expect(streamLink("Netflix", [crunchy, netflix])).toBe(netflix.url);
    expect(streamLink("Crunchyroll", [crunchy, netflix])).toBe(crunchy.url);
    expect(streamLink("Amazon Prime Video", [primeSub])).toBe(primeSub.url);
  });

  it("prefers a subscription page to a rental one", () => {
    expect(streamLink("Amazon Prime Video", [primeRent, primeSub])).toBe(primeSub.url);
    expect(streamLink("Amazon Prime Video", [primeRent])).toBe(primeRent.url);
  });

  it("doesn't take another service's channel on Prime Video for Prime Video itself", () => {
    const channel: StreamSource = { name: "Crunchyroll Premium (Via Prime) Amazon Channel", type: "sub", url: "https://app.primevideo.com/detail?gti=amzn1.dv.gti.channel" };
    expect(streamLink("Amazon Prime Video", [channel])).toBe("");
    expect(streamLink("Amazon Prime Video", [channel, { name: "Prime Video", type: "sub", url: "https://app.primevideo.com/detail?gti=amzn1.dv.gti.own" }])).toBe("https://app.primevideo.com/detail?gti=amzn1.dv.gti.own");
  });

  it("is nothing for a service it has no page for, or an unknown one", () => {
    expect(streamLink("Netflix", [crunchy])).toBe("");
    expect(streamLink("Some Service", [netflix])).toBe("");
    expect(streamLink("Netflix", [])).toBe("");
    expect(streamLink("Netflix", null)).toBe("");
  });

  it("never leads off the service's own website", () => {
    expect(streamLink("Netflix", [{ name: "Netflix", type: "sub", url: "https://www.netflix.com.evil.example/title/1" }])).toBe("");
    expect(streamLink("Netflix", [{ name: "Netflix", type: "sub", url: "http://www.netflix.com/title/1" }])).toBe("");
    expect(streamLink("Netflix", [{ name: "Netflix", type: "sub", url: "javascript:alert(1)" }])).toBe("");
    expect(streamLink("Amazon Prime Video", [{ name: "Prime", type: "sub", url: "https://www.amazon.in/gp/video/detail/B0X" }])).toBe("https://www.amazon.in/gp/video/detail/B0X");
  });

  it("comes after Wikidata's page for the same service", () => {
    expect(directLink("Netflix", { P1874: "123" }, [netflix])).toBe("https://www.netflix.com/title/123");
    expect(directLink("Netflix", {}, [netflix])).toBe(netflix.url);
    expect(directLink("Netflix", null, null)).toBe("");
  });
});

describe("reading the title service's answer", () => {
  it("keeps well-formed sources and drops the rest", () => {
    expect(parseStreamSources({ sources: [netflix, { name: "x", type: "sub", url: "http://plain.example" }, { name: 3 }, null] })).toEqual([netflix]);
    expect(parseStreamSources(null)).toEqual([]);
    expect(parseStreamSources({ sources: "no" })).toEqual([]);
  });
});

describe("asking for a title's pages", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });
  });

  it("asks once, then answers from this device", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sources: [netflix] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchStreamSources("tv", "1396", "IN", 1000)).toEqual([netflix]);
    expect(await fetchStreamSources("tv", "1396", "IN", 2000)).toEqual([netflix]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/links\/tv\/1396\?region=IN$/);
    await fetchStreamSources("tv", "1396", "us", 3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks again after a week, or a day when there was nothing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sources: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await fetchStreamSources("movie", "603", "IN", 0);
    await fetchStreamSources("movie", "603", "IN", 60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchStreamSources("movie", "603", "IN", 25 * 60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives nothing when the service can't answer, and doesn't ask again for ten minutes", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchStreamSources("tv", "77", "IN", 0)).toEqual([]);
    expect(await fetchStreamSources("tv", "77", "IN", 5 * 60 * 1000)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchStreamSources("tv", "77", "IN", 11 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't ask for something that isn't a title", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchStreamSources("person", "1", "IN")).toEqual([]);
    expect(await fetchStreamSources("tv", "../x", "IN")).toEqual([]);
    expect(await fetchStreamSources(undefined, undefined, "IN")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
