import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const NOW = Date.now();

/** A saved title as the synced list holds it. */
export function title(over: Record<string, unknown> = {}) {
  return { id: "t1", title: "Sample Show", year: "2022", mediaType: "Show", tmdbType: "tv", tmdbId: "1001", createdAt: NOW - 1e6, updatedAt: NOW - 1e6, ...over };
}

/** A signed-in state with this list (Google's own pages are never reached; the stubs below answer instead). */
export async function signedIn(page: Page, movies: unknown[] = []) {
  await page.addInitScript(({ movies, now }) => {
    localStorage.setItem("flickcue.library", JSON.stringify({ movies, deleted: [] }));
    localStorage.setItem("flickcue.settings", JSON.stringify({ region: "IN", theme: "dark" }));
    localStorage.setItem("flickcue.sync", JSON.stringify({ connected: true, fileId: "fake", lastSyncAt: now, account: { name: "Test", email: "t@example.com", photo: "" } }));
    localStorage.setItem("flickcue.googleToken", JSON.stringify({ accessToken: "fake", expiresAt: now + 3e6, source: "google" }));
  }, { movies, now: NOW });
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200) => ({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });

export interface Stubs {
  /** Answers /tmdb/<path> (with its query string as the second argument); return undefined to fall through to an empty page of results. */
  tmdb?: (path: string, params: URLSearchParams) => unknown;
  /** Make every title-service call fail, as when offline. */
  offline?: boolean;
  mdblist?: unknown;
  links?: unknown;
  /** What /contact answers: a status and body, or "network" to fail. */
  contact?: { status: number; body: unknown } | "network";
}

/** Everything that would leave the machine is answered here, and what was sent to /contact is recorded. */
export async function stub(page: Page, stubs: Stubs = {}) {
  const posted: Record<string, unknown>[] = [];
  await page.route(/accounts\.google\.com|googleapis\.com|youtube|ytimg|challenges\.cloudflare\.com/, (route) => route.abort());
  await page.route("https://query.wikidata.org/**", (route) => route.fulfill(json({ results: { bindings: [] } })));
  await page.route("https://image.tmdb.org/**", (route) => route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACw=", "base64") }));
  await page.route("https://api.flickcue.in/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    if (stubs.offline) return route.abort();
    if (url.pathname === "/contact") {
      posted.push(JSON.parse(request.postData() || "{}"));
      if (stubs.contact === "network") return route.abort();
      const answer = stubs.contact ?? { status: 200, body: { ok: true } };
      return route.fulfill(json(answer.body, answer.status));
    }
    if (url.pathname.startsWith("/mdblist/")) return route.fulfill(json(stubs.mdblist ?? { ratings: [] }));
    if (url.pathname.startsWith("/links/")) return route.fulfill(json(stubs.links ?? { sources: [] }));
    if (url.pathname.startsWith("/tmdb/")) {
      const body = stubs.tmdb?.(url.pathname.replace("/tmdb/", ""), url.searchParams);
      return route.fulfill(json(body ?? { results: [], total_pages: 1 }));
    }
    return route.fulfill(json({}, 404));
  });
  return { posted };
}

/** TMDB's answer for one show, with only what the title page reads. */
export function showDetails(over: Record<string, unknown> = {}) {
  return {
    name: "Sample Show", overview: "A show used by the tests.", status: "Returning Series", first_air_date: "2022-01-01", vote_average: 8.1,
    number_of_seasons: 2, number_of_episodes: 6, episode_run_time: [45], networks: [{ name: "Test Network" }],
    seasons: [{ season_number: 1, episode_count: 3, name: "Season 1" }, { season_number: 2, episode_count: 3, name: "Season 2" }],
    external_ids: { imdb_id: "tt0000001" },
    "watch/providers": { results: { IN: { flatrate: [
      { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg" },
      { provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/p.jpg" }
    ] } } },
    ...over
  };
}

/**
 * Waits for every animation that ends to end. A dialog is "visible" to Playwright from the first frame of its fade-in, but
 * axe reads what is drawn: half-way through the fade its text is washed out (colour-contrast), and at the first frame it
 * isn't counted as an open dialog, so the page behind it, which is inert, seems to have no heading. Endless ones (a spinner)
 * are left running, and so are those that follow the scroll position rather than the clock (the Queue's drifting poster),
 * which only move when the page does.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    for (let pass = 0; pass < 5; pass++) {
      const running = document.getAnimations().filter((animation) => animation.timeline === document.timeline && animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === "running");
      if (!running.length) return;
      // A cancelled animation (its element left the page) rejects `finished`; it is over all the same.
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    }
  });
}

/**
 * Runs axe on the page as it stands, once its animations have finished, and fails with the rules and elements broken.
 * `exclude` leaves out parts axe can't measure honestly (text laid over a title's backdrop photo); say why where it is used.
 */
export async function expectNoAxeViolations(page: Page, context?: string, exclude: string[] = []) {
  await settleAnimations(page);
  // evaluate() isn't subject to the page's policy (which refuses inline scripts), as addScriptTag would be.
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async (skip) => {
    const axe = (window as unknown as { axe: { run: (root: object, options: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(skip.length ? { include: [["body"]], exclude: skip.map((selector) => [selector]) } : document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } });
    return result.violations.map((rule) => `${rule.id}: ${rule.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`);
  }, exclude);
  expect(violations, context).toEqual([]);
}
