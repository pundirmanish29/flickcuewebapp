// A title's own page on each streaming service, so a service's button opens
// the show or film itself rather than a search. Wikidata (Wikimedia's open
// database) records many titles' IDs on Netflix, Prime Video, Apple TV,
// Crunchyroll and others; it's asked once per title, by TMDB number, straight
// from the browser, and the answer is kept on this device for 30 days. A
// title or service it has nothing for keeps the search link.

const ENDPOINT = "https://query.wikidata.org/sparql";
const STORE_KEY = "flickcue.serviceLinks";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP_TITLES = 300;

/** The title being linked: some services' addresses name it as well as number it. */
export interface LinkTitle {
  title: string;
  tmdbType?: string;
}

const slug = (title: string) =>
  title.replace(/\s*\(\d{4}\)$/, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "title";

/**
 * A service's ID property on Wikidata, and the page an ID opens. Netflix,
 * Prime Video, Apple TV, Crunchyroll and MUBI were checked to open the title
 * itself. JioHotstar's is its /in/movies|shows/<name>/<id> address, with the
 * ten-digit content ID Wikidata holds for about 300 titles (the name in the
 * address is for show; Hotstar goes by the number). SonyLIV's couldn't be
 * checked, so it keeps the search.
 */
const PROPERTIES: Record<string, { service: RegExp; url: (id: string, title?: LinkTitle) => string; valid?: RegExp }> = {
  P1874: { service: /netflix/i, url: (id) => `https://www.netflix.com/title/${id}` },
  P14440: { service: /prime video|amazon video|amazon prime/i, url: (id) => `https://www.primevideo.com/detail/${id}` },
  P9751: { service: /apple tv/i, url: (id) => `https://tv.apple.com/show/${id}` },
  P9586: { service: /apple tv/i, url: (id) => `https://tv.apple.com/movie/${id}` },
  P11330: { service: /crunchyroll/i, url: (id) => `https://www.crunchyroll.com/series/${id}` },
  P11049: {
    service: /hotstar/i,
    valid: /^\d{9,12}$/,
    url: (id, title) => `https://www.hotstar.com/in/${title?.tmdbType === "tv" ? "shows" : "movies"}/${slug(title?.title ?? "")}/${id}`
  },
  P7299: { service: /mubi/i, url: (id) => `https://mubi.com/films/${id}` },
  P6562: { service: /google play/i, url: (id) => `https://play.google.com/store/movies/details?id=${id}` }
};

/** Property → ID, as Wikidata gave them. */
export type ServiceIds = Record<string, string>;

const SAFE_ID = /^[\w.:/-]{1,120}$/;

/** The page a service has for the title, or "" when there's no ID for it. */
export function serviceLink(provider: string, ids: ServiceIds | null | undefined, title?: LinkTitle): string {
  if (!ids) return "";
  for (const [property, { service, url, valid }] of Object.entries(PROPERTIES)) {
    const id = ids[property];
    if (id && SAFE_ID.test(id) && !id.includes("..") && (!valid || valid.test(id)) && service.test(provider)) return url(id, title);
  }
  return "";
}

/** The SPARQL that asks for every service ID of the title with this TMDB number. */
export function serviceQuery(tmdbType: "movie" | "tv", tmdbId: string): string {
  const tmdbProperty = tmdbType === "tv" ? "P4983" : "P4947";
  const properties = Object.keys(PROPERTIES).map((property) => `wd:${property}`).join(" ");
  return `SELECT ?prop ?id WHERE { ?item wdt:${tmdbProperty} "${tmdbId}" . VALUES ?prop { ${properties} } ?prop wikibase:directClaim ?claim . ?item ?claim ?id . } LIMIT 60`;
}

/** Wikidata's answer, down to property → ID (the first of each). */
export function parseServiceIds(data: unknown): ServiceIds {
  const ids: ServiceIds = {};
  const rows = (data as { results?: { bindings?: { prop?: { value?: string }; id?: { value?: string } }[] } })?.results?.bindings;
  for (const row of Array.isArray(rows) ? rows : []) {
    const property = String(row?.prop?.value ?? "").split("/").pop() ?? "";
    const id = String(row?.id?.value ?? "");
    if (property in PROPERTIES && SAFE_ID.test(id) && !(property in ids)) ids[property] = id;
  }
  return ids;
}

type Stored = Record<string, { at: number; ids: ServiceIds }>;

function readStore(): Stored {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeStore(store: Stored) {
  try {
    const kept = Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP_TITLES);
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Without storage the title is asked about again next time.
  }
}

const pending = new Map<string, Promise<ServiceIds>>();
/** When a lookup last failed, so a service that is down or not set up yet is asked again in ten minutes, not on every page. */
const failedAt = new Map<string, number>();
const RETRY_MS = 10 * 60 * 1000;

/** The title's service IDs: kept ones when fresh, otherwise asked of Wikidata (nothing when it can't be reached). */
export function fetchServiceIds(tmdbType: string | undefined, tmdbId: string | undefined, now = Date.now()): Promise<ServiceIds> {
  if ((tmdbType !== "movie" && tmdbType !== "tv") || !/^\d{1,10}$/.test(String(tmdbId ?? ""))) return Promise.resolve({});
  const key = `${tmdbType}:${tmdbId}`;
  const kept = readStore()[key];
  if (kept && now - kept.at < KEEP_MS) return Promise.resolve(kept.ids);
  const running = pending.get(key);
  if (running) return running;
  const failed = failedAt.get(key);
  if (failed && now - failed < RETRY_MS) return Promise.resolve({});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const request = fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(serviceQuery(tmdbType, String(tmdbId)))}`, {
    headers: { Accept: "application/sparql-results+json" },
    signal: controller.signal
  })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((data) => {
      const ids = parseServiceIds(data);
      writeStore({ ...readStore(), [key]: { at: now, ids } });
      return ids;
    })
    .catch((): ServiceIds => {
      failedAt.set(key, now);
      return {};
    })
    .finally(() => {
      clearTimeout(timer);
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}
