// Where a streaming service's button goes: that service's own search for the
// title, which on a phone opens its app when installed, rather than a
// listings page. Services without a search address we could confirm get a
// Google search for the title on that service.

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

export function providerLink(provider: string, title: string): string {
  const name = plain(title);
  const search = SEARCHES.find(([pattern]) => pattern.test(provider));
  if (search) return search[1](encodeURIComponent(name));
  return `https://www.google.com/search?q=${encodeURIComponent(`watch "${name}" on ${provider}`)}`;
}
