// The browser's own words for a request that never got an answer ("Failed to
// fetch", "NetworkError when attempting to fetch resource.", "Load failed")
// mean nothing to a reader. Say what happened and what happens next instead.

const NETWORK = /failed to fetch|networkerror|load failed|network request failed|network error/i;

export function isNetworkError(message: string | undefined): boolean {
  return NETWORK.test(message ?? "");
}

/** A sync error as a sentence a reader can act on. */
export function syncErrorText(message: string | undefined): string {
  if (!message) return "";
  return isNetworkError(message) ? "Couldn't reach Google Drive. Check your connection; FlickCue tries again on its own." : message;
}

/** A title-service error as a sentence a reader can act on. */
export function lookupErrorText(message: string | undefined): string {
  if (!message) return "";
  return isNetworkError(message) ? "Couldn't reach FlickCue's title service. Check your connection and try again." : message;
}
