// Every title has a page of its own: a saved one at #/title/<its id>, one
// that isn't saved at #/title/tmdb:<movie|tv>:<TMDB id> (its Discover key).
// The page you came from stays mounted underneath; going back returns to it
// at the same scroll position.

let scrollBeforeTitle = 0;

// The app puts the page back where it was itself; the browser's own restore on Back would scroll it to the title page's position.
if (typeof history !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = "manual";

/** A Discover or search result's key, the address of a title that isn't saved. */
const CANDIDATE_KEY = /^tmdb:(movie|tv):(\d{1,10})$/;

export function parseCandidateKey(id: string): { tmdbType: "movie" | "tv"; tmdbId: string } | null {
  const match = CANDIDATE_KEY.exec(id);
  return match ? { tmdbType: match[1] as "movie" | "tv", tmdbId: match[2] } : null;
}

const onTitle = () => location.hash.startsWith("#/title/");

/** Opens a title's page, leaving a history entry so Back returns to where you were. */
export function goToTitle(id: string) {
  const hash = `#/title/${encodeURIComponent(id)}`;
  if (location.hash === hash) return;
  if (!onTitle()) scrollBeforeTitle = window.scrollY;
  const oldURL = location.href;
  history.pushState({ fromApp: true }, "", hash);
  window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: location.href }));
}

/** Leaves the title page: back through history when the app opened it, else to `fallback` (a page's hash). */
export function leaveTitle(fallback: string) {
  if ((history.state as { fromApp?: boolean } | null)?.fromApp) {
    history.back();
    return;
  }
  const oldURL = location.href;
  history.replaceState(null, "", fallback);
  window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: location.href }));
}

/** Where the page underneath was scrolled to when the first title opened over it. */
export function scrollToRestore(): number {
  return scrollBeforeTitle;
}
