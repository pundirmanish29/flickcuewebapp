// The extension's web sign-in client. Drive's appDataFolder is shared by every
// client in the same Google Cloud project, so using it (or another client
// from that project) is what lets the web app read the same
// flickcue-watchlist.json as the extension and the Android app.
const EXTENSION_WEB_CLIENT_ID = "57933203348-qa13rc5t35ju120ccbhteehjmtafpvpv.apps.googleusercontent.com";

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || EXTENSION_WEB_CLIENT_ID;
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
// Asked for only when someone turns on "Add reminders to Google Calendar": it reaches only the calendar this app
// makes for itself (and events on it), never the rest of their calendars.
// The Calendar mirror ships dark: nothing about it shows or runs unless the site is built with VITE_CALENDAR_MIRROR=1
// (for people on the Google project's test-user list, until the Calendar permission is approved).
export const CALENDAR_MIRROR_ENABLED = (import.meta.env.VITE_CALENDAR_MIRROR as string | undefined)?.trim() === "1";
// Long-lived sign-in ships dark too: nothing changes unless the site is built with VITE_LONG_SIGNIN=1, which should
// only be set once the title service's /oauth routes accept this site (see README, "Staying signed in").
export const LONG_SIGNIN_ENABLED = (import.meta.env.VITE_LONG_SIGNIN as string | undefined)?.trim() === "1";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
// The FlickCue extension, asked for its Google session so someone signed in
// there arrives signed in here. The Chrome Web Store build first, then the
// unpacked one, whose id is pinned by the "key" in its manifest.
export const EXTENSION_IDS = ["hmgefidihfkkeleeblhecnhlkbbojmmh", "jojcdljmjbgkpakaacobgnpcfmcambaa"];
export const PROXY_BASE_URL = ((import.meta.env.VITE_PROXY_URL as string | undefined)?.trim() || "https://api.flickcue.in").replace(/\/+$/, "");


/** Where people reach the developer; the extension and the Android app show the same address. */
export const SUPPORT_EMAIL = "support@flickcue.in";

/** The FlickCue add-on's page on Firefox Add-ons. */
export const FIREFOX_EXTENSION_URL = "https://addons.mozilla.org/en-US/firefox/addon/flickcue/";

/** The FlickCue extension's Chrome Web Store page. */
export const EXTENSION_URL = "https://chromewebstore.google.com/detail/flickcue-watch-later/hmgefidihfkkeleeblhecnhlkbbojmmh?hl=en";
