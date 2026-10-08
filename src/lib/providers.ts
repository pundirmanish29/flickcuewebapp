// Where a streaming service's button goes: that service's own search for the
// title, which on a phone opens its app when installed, rather than a
// listings page; or its search page when it can't take the title. Services
// without either that we could confirm get a Google search for the title on
// that service.

const plain = (title: string) => title.replace(/\s*\(\d{4}\)$/, "").trim();

const SEARCHES: [RegExp, (query: string) => string][] = [
  [/netflix/i, (q) => `https://www.netflix.com/search?q=${q}`],
  [/prime video|amazon video|amazon prime/i, (q) => `https://www.primevideo.com/search/ref=atv_nb_sug?phrase=${q}`],
  [/hotstar/i, (q) => `https://www.hotstar.com/in/explore?search_query=${q}`],
  [/apple tv/i, (q) => `https://tv.apple.com/search?term=${q}`],
  [/zee\s?5/i, (q) => `https://www.zee5.com/search?q=${q}`],
  [/sony\s?liv/i, (q) => `https://www.sonyliv.com/search?searchTerm=${q}`],
  [/mubi/i, (q) => `https://mubi.com/en/search/films?query=${q}`],
  [/youtube/i, (q) => `https://www.youtube.com/results?search_query=${q}`],
  [/google play/i, (q) => `https://play.google.com/store/search?q=${q}&c=movies`],
  [/crunchyroll/i, (q) => `https://www.crunchyroll.com/search?q=${q}`],
  [/sun\s?nxt/i, (q) => `https://www.sunnxt.com/search?q=${q}`],
  [/^aha\b/i, (q) => `https://www.aha.video/search?q=${q}`]
];

// Services whose search page can't be opened with the title already in it
// (Lionsgate Play's app takes no search term in its address): the button
// opens the service's own search, rather than a search engine.
const SEARCH_PAGES: [RegExp, string][] = [
  [/lionsgate\s?play/i, "https://www.lionsgateplay.com/search"]
];

export function providerLink(provider: string, title: string): string {
  const name = plain(title);
  const search = SEARCHES.find(([pattern]) => pattern.test(provider));
  if (search) return search[1](encodeURIComponent(name));
  const page = SEARCH_PAGES.find(([pattern]) => pattern.test(provider));
  if (page) return page[1];
  return `https://www.google.com/search?q=${encodeURIComponent(`watch "${name}" on ${provider}`)}`;
}

// On Android a service's link opens its app when it's installed, at the same
// address (an intent naming the app, with the website as the fallback), and
// its website when it isn't. An iPhone does this itself for the services'
// own https links (universal links), so elsewhere the link stays as it is.
const ANDROID_APPS: [RegExp, string][] = [
  [/netflix/i, "com.netflix.mediaclient"],
  [/prime video|amazon video|amazon prime/i, "com.amazon.avod.thirdpartyclient"],
  [/hotstar/i, "in.startv.hotstar"],
  [/zee\s?5/i, "com.graymatrix.did"],
  [/sony\s?liv/i, "com.sonyliv"],
  [/youtube/i, "com.google.android.youtube"],
  [/crunchyroll/i, "com.crunchyroll.crunchyroid"],
  [/mubi/i, "com.mubi"]
];

/** `direct` is the title's own page on the service when it's known (lib/serviceLinks.ts); otherwise its search. */
export function appLink(provider: string, title: string, userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent, direct = ""): string {
  const web = /^https:\/\//.test(direct) ? direct : providerLink(provider, title);
  const app = /android/i.test(userAgent) ? ANDROID_APPS.find(([pattern]) => pattern.test(provider)) : undefined;
  if (!app || web.startsWith("https://www.google.com/")) return web;
  const url = new URL(web);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=${app[1]};S.browser_fallback_url=${encodeURIComponent(web)};end`;
}

// "Lionsgate Play Amazon Channel", "Amazon Prime Video with Ads": the same
// service reached another way.
const VARIANT = /\s+(amazon channels?|apple tv channels?|roku premium channel|standard with ads|with ads)$/i;

/** Drops a service's channel and ad-tier variants when the service itself is listed. */
export function dedupeProviders<T extends { name: string }>(list: T[]): T[] {
  const names = new Set(list.map((provider) => provider.name.toLowerCase()));
  return list.filter((provider) => {
    const base = provider.name.replace(VARIANT, "");
    return base === provider.name || !names.has(base.toLowerCase());
  });
}

/** "Lionsgate+ Amazon Channels" as the service and the way in: ["Lionsgate+", "via Prime Video"]. */
export function splitChannel(name: string): [string, string] {
  const match = name.match(/^(.+?)\s+(amazon|apple tv) channels?$/i);
  if (!match) return [name, ""];
  return [match[1], match[2].toLowerCase() === "amazon" ? "via Prime Video" : "via Apple TV"];
}
