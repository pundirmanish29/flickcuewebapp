// Where each streaming service shows a title (Netflix, Prime Video, Crunchyroll
// and the rest), from Watchmode through FlickCue's title service, for the
// services Wikidata (lib/serviceLinks.ts) has no page for. Only a page on the
// service's own website is used, so a button can never lead somewhere else.
// Kept on this device for a week (a day when there was nothing).

import { PROXY_BASE_URL } from "./config";
import { serviceLink, type LinkTitle, type ServiceIds } from "./serviceLinks";

export interface StreamSource {
  name: string;
  type: string;
  url: string;
}

/** The websites each service's pages live on, so a source is only used for the service it belongs to. */
const HOSTS: [RegExp, RegExp][] = [
  [/netflix/i, /(^|\.)netflix\.com$/],
  [/prime video|amazon video|amazon prime/i, /(^|\.)(primevideo\.com|amazon\.[a-z]{2,3}(\.[a-z]{2})?)$/],
  [/hotstar/i, /(^|\.)hotstar\.com$/],
  [/apple tv/i, /^tv\.apple\.com$/],
  [/crunchyroll/i, /(^|\.)crunchyroll\.com$/],
  [/mubi/i, /(^|\.)mubi\.com$/],
  [/zee\s?5/i, /(^|\.)zee5\.com$/],
  [/sony\s?liv/i, /(^|\.)sonyliv\.com$/],
  [/google play/i, /^play\.google\.com$/],
  [/youtube/i, /(^|\.)youtube\.com$/],
  [/sun\s?nxt/i, /(^|\.)sunnxt\.com$/],
  [/^aha\b/i, /(^|\.)aha\.video$/],
  [/lionsgate\s?play/i, /(^|\.)lionsgateplay\.com$/]
];

/** Included first: a subscription or free page beats a rental one. */
const ORDER = ["sub", "free", "tve", "rent", "buy"];

/** The page this service has for the title, or "" when there's none (or none that is on the service's own website). */
export function streamLink(provider: string, sources: StreamSource[] | null | undefined): string {
  const rule = HOSTS.find(([name]) => name.test(provider));
  if (!rule || !sources?.length) return "";
  const own = sources.filter((source) => {
    try {
      const page = new URL(source.url);
      return page.protocol === "https:" && rule[1].test(page.hostname);
    } catch {
      return false;
    }
  });
  own.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  return own[0]?.url ?? "";
}

/** The title's own page on the service: Wikidata's when it has one, else Watchmode's, else "" (the service's search). */
export function directLink(provider: string, ids: ServiceIds | null | undefined, sources: StreamSource[] | null | undefined, title?: LinkTitle): string {
  return serviceLink(provider, ids, title) || streamLink(provider, sources);
}

/** The title service's answer, down to well-formed sources. */
export function parseStreamSources(data: unknown): StreamSource[] {
  const list = (data as { sources?: unknown })?.sources;
  const out: StreamSource[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const { name, type, url } = (item ?? {}) as Record<string, unknown>;
    if (typeof name === "string" && typeof type === "string" && typeof url === "string" && /^https:\/\//.test(url) && url.length <= 500) {
      out.push({ name: name.slice(0, 60), type, url });
    }
  }
  return out.slice(0, 40);
}

const STORE_KEY = "flickcue.streamLinks";
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_EMPTY_MS = 24 * 60 * 60 * 1000;
const KEEP_TITLES = 200;
const RETRY_MS = 10 * 60 * 1000;

type Stored = Record<string, { at: number; sources: StreamSource[] }>;

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
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP_TITLES))));
  } catch {
    // Without storage the title is asked about again next time.
  }
}

const pending = new Map<string, Promise<StreamSource[]>>();
/** When a lookup last failed, so a service that is down or not set up yet is asked again in ten minutes, not on every page. */
const failedAt = new Map<string, number>();

/** The title's service pages: kept ones when fresh, otherwise asked of the title service (nothing when it can't answer). */
export function fetchStreamSources(tmdbType: string | undefined, tmdbId: string | undefined, region: string | undefined, now = Date.now()): Promise<StreamSource[]> {
  if ((tmdbType !== "movie" && tmdbType !== "tv") || !/^\d{1,10}$/.test(String(tmdbId ?? ""))) return Promise.resolve([]);
  const country = /^[A-Za-z]{2}$/.test(region ?? "") ? String(region).toUpperCase() : "IN";
  const key = `${tmdbType}:${tmdbId}:${country}`;
  const kept = readStore()[key];
  if (kept && now - kept.at < (kept.sources.length ? KEEP_MS : KEEP_EMPTY_MS)) return Promise.resolve(kept.sources);
  const running = pending.get(key);
  if (running) return running;
  const failed = failedAt.get(key);
  if (failed !== undefined && now - failed < RETRY_MS) return Promise.resolve([]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const request = fetch(`${PROXY_BASE_URL}/links/${tmdbType}/${tmdbId}?region=${country}`, { headers: { Accept: "application/json" }, signal: controller.signal })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((data) => {
      const sources = parseStreamSources(data);
      writeStore({ ...readStore(), [key]: { at: now, sources } });
      return sources;
    })
    .catch((): StreamSource[] => {
      failedAt.set(key, now);
      return [];
    })
    .finally(() => {
      clearTimeout(timer);
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}
