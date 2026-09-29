// Opening Discover on something from elsewhere (a cast member, a genre in a
// title's details): the page to show is handed over here, then Discover opens.

export interface DiscoverIntent {
  search?: string;
  genre?: string;
}

const EVENT = "flickcue:discover-intent";
let pending: DiscoverIntent = {};

export function goDiscover(intent: DiscoverIntent) {
  pending = { ...intent };
  location.hash = "#/discover";
  // After the route change has reset the page, so the intent isn't cleared by it.
  window.setTimeout(() => window.dispatchEvent(new Event(EVENT)), 60);
}

/** Takes one part of the pending intent, once. */
export function takeIntent<K extends keyof DiscoverIntent>(key: K): DiscoverIntent[K] {
  const value = pending[key];
  delete pending[key];
  return value;
}

export function onIntent(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Whether part of the intent is waiting, without taking it. */
export const hasIntent = (key: keyof DiscoverIntent) => Boolean(pending[key]);
