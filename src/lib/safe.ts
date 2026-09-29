// Values read from Drive are checked before they're used, since the file can
// be written by any FlickCue app (and, in the worst case, by anyone holding a
// token for it). Text is safe as it is: React never renders it as markup.
// What isn't: addresses the page would load or open, and ids put into paths.

const TMDB_IMAGE = /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[\w-]+\.(jpg|jpeg|png|webp|svg)$/i;

/** A TMDB image address, or "" for anything else (the card then shows initials). */
export function safeImage(url: unknown): string {
  return typeof url === "string" && TMDB_IMAGE.test(url) ? url : "";
}

/** An ordinary web page address, or "". */
export function safeLink(url: unknown): string {
  if (typeof url !== "string") return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export const safeTmdbId = (id: unknown): string => (typeof id === "string" || typeof id === "number") && /^\d{1,10}$/.test(String(id)) ? String(id) : "";

export const safeImdbId = (id: unknown): string => typeof id === "string" && /^tt\d{5,10}$/.test(id) ? id : "";
