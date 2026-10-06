import { EXTENSION_URL, FIREFOX_EXTENSION_URL } from "./config";

export interface StoreLink {
  browser: "Chrome" | "Firefox";
  url: string;
}

/** Where to get the extension for the browser this is: Firefox's add-ons page in Firefox, the Chrome Web Store otherwise (Chrome and Edge both install from it). */
export function extensionStore(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): StoreLink {
  return /firefox/i.test(userAgent) && !/seamonkey/i.test(userAgent)
    ? { browser: "Firefox", url: FIREFOX_EXTENSION_URL }
    : { browser: "Chrome", url: EXTENSION_URL };
}
