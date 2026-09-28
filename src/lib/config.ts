// The extension's web sign-in client. Drive's appDataFolder is shared by every
// client in the same Google Cloud project, so using it (or another client
// from that project) is what lets the web app read the same
// flickcue-watchlist.json as the extension and the Android app.
const EXTENSION_WEB_CLIENT_ID = "57933203348-qa13rc5t35ju120ccbhteehjmtafpvpv.apps.googleusercontent.com";

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || EXTENSION_WEB_CLIENT_ID;
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
// The FlickCue extension, asked for its Google session so someone signed in
// there arrives signed in here. The Chrome Web Store build first, then the
// unpacked one, whose id is pinned by the "key" in its manifest.
export const EXTENSION_IDS = ["hmgefidihfkkeleeblhecnhlkbbojmmh", "jojcdljmjbgkpakaacobgnpcfmcambaa"];
export const PROXY_BASE_URL = ((import.meta.env.VITE_PROXY_URL as string | undefined)?.trim() || "https://flickcue-proxy.manishpundir29.workers.dev").replace(/\/+$/, "");

export const TMDB_ATTRIBUTION = "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.";
