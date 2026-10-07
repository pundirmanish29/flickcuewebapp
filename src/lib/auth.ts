// Google sign-in through Google Identity Services' token model. A web page
// can't keep a client secret or a refresh token safely, so it holds only a
// short-lived access token (about an hour) and asks Google for a new one when
// it runs out. After the first consent that is a popup that closes by itself.

import { CALENDAR_SCOPE, EXTENSION_IDS, GOOGLE_CLIENT_ID, GOOGLE_SCOPE } from "./config";
import { letterboxdHandle } from "./letterboxd";
import type { Account } from "./drive";

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  /** The permissions actually granted, space-separated: a person can untick one at Google's consent screen. */
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

interface CodeResponse {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface CodeClient {
  requestCode(): void;
}

declare global {
  interface Window {
    // Present on a page only when an installed extension lists it in its
    // manifest's externally_connectable, which the FlickCue extension does.
    chrome?: {
      runtime?: {
        sendMessage?: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
        lastError?: unknown;
      };
    };
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): TokenClient;
          initCodeClient(config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            login_hint?: string;
            callback: (response: CodeResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): CodeClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

const TOKEN_KEY = "flickcue.googleToken";
// A second slot, written only when the granted permissions include Calendar. Renewing sync silently from the
// extension replaces the first slot with a Drive-only token; this one is never touched by that.
const CALENDAR_TOKEN_KEY = "flickcue.calendarToken";
const EXPIRY_MARGIN = 60 * 1000;

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Couldn't load Google sign-in. Check your connection or content blocker."));
      };
      document.head.append(script);
    });
  }
  return scriptPromise;
}

export interface StoredToken {
  accessToken: string;
  expiresAt: number;
  /** "extension" when the FlickCue extension lent it; that one is never revoked here. */
  source?: "google" | "extension";
  /** What Google said this token may do, when it said. */
  scope?: string;
}

/** Whether a granted-permissions string includes the Calendar permission. */
export function grantsCalendar(scope: string | undefined): boolean {
  return Boolean(scope) && scope!.split(/\s+/).includes(CALENDAR_SCOPE);
}

function readSlot(key: string): StoredToken | null {
  try {
    const token = JSON.parse(localStorage.getItem(key) || "null") as StoredToken | null;
    if (token?.accessToken && token.expiresAt - EXPIRY_MARGIN > Date.now()) return token;
  } catch {
    // Unreadable storage just means signing in again.
  }
  return null;
}

function writeSlot(key: string, token: StoredToken | null) {
  try {
    if (token) localStorage.setItem(key, JSON.stringify(token));
    else localStorage.removeItem(key);
  } catch {
    // Private windows can refuse storage; the token then lasts for this page only.
  }
}

/** The token that may use Calendar, if there is a live one. Never the extension's. */
export function getCalendarToken(): StoredToken | null {
  const token = readSlot(CALENDAR_TOKEN_KEY);
  return token && grantsCalendar(token.scope) ? token : null;
}

export function storeCalendarToken(token: StoredToken | null) {
  writeSlot(CALENDAR_TOKEN_KEY, token);
}

export function getStoredToken(): StoredToken | null {
  return readSlot(TOKEN_KEY);
}

export function storeToken(token: StoredToken | null) {
  writeSlot(TOKEN_KEY, token);
}

function describeError(code: string | undefined, fallback?: string): string {
  if (code === "access_denied") return "You declined the Google permission request.";
  if (code === "popup_closed") return "The Google window was closed before signing in finished.";
  if (code === "popup_failed_to_open") return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
  if (code === "idpiframe_initialization_failed" || code === "origin_mismatch") {
    return `Google doesn't recognise this site yet. Add ${location.origin} to the OAuth client's Authorized JavaScript origins.`;
  }
  return fallback || (code ? `Google returned "${code}".` : "Google sign-in failed.");
}

/**
 * Asks Google for an access token. `prompt: "consent"` shows the account
 * picker and consent screen; an empty prompt reuses an earlier grant and only
 * flashes a popup. Must be called from a click, or the popup is blocked.
 */
export function requestToken({ consent = false, hint = "", calendar = false, persist = true } = {}): Promise<StoredToken> {
  // With the script already loaded, Google's window opens inside the tap itself. Waiting for a download first
  // lets some phones' browsers (Safari's, notably) treat the window as unasked-for and block it.
  if (window.google?.accounts?.oauth2) return openGoogleWindow(consent, hint, calendar, persist);
  return loadScript().then(() => openGoogleWindow(consent, hint, calendar, persist));
}

/**
 * Fetches Google's sign-in script ahead of the tap that needs it, so that tap can open the window at once.
 * Only the script is fetched: nothing is asked of Google until someone signs in.
 */
export function preloadGoogleSignIn() {
  loadScript().catch(() => {
    // Offline or blocked: the tap itself says so.
  });
}

function openGoogleWindow(consent: boolean, hint: string, calendar: boolean, persist: boolean): Promise<StoredToken> {
  const oauth2 = window.google!.accounts.oauth2;

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      // One window, one token: with Calendar on, both permissions are asked for together.
      scope: calendar ? `${GOOGLE_SCOPE} ${CALENDAR_SCOPE}` : GOOGLE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(describeError(response.error, response.error_description)));
          return;
        }
        const token: StoredToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
          source: "google",
          ...(response.scope ? { scope: response.scope } : {})
        };
        if (persist) storeToken(token);
        // Only what Google says was granted counts: Calendar can be unticked at the consent screen.
        if (persist && grantsCalendar(token.scope)) storeCalendarToken(token);
        resolve(token);
      },
      error_callback: (error) => reject(new Error(describeError(error.type, error.message)))
    });
    client.requestAccessToken({ prompt: consent ? "consent" : "", ...(hint ? { login_hint: hint } : {}) });
  });
}

/**
 * Asks Google for an authorization code, to be exchanged for a long-lived grant by the title service (the one place
 * that holds the client secret). Like `requestToken`, the window opens inside the tap when the script is already loaded.
 */
export function requestCode({ hint = "", calendar = false } = {}): Promise<{ code: string; scope: string }> {
  if (window.google?.accounts?.oauth2) return openCodeWindow(hint, calendar);
  return loadScript().then(() => openCodeWindow(hint, calendar));
}

function openCodeWindow(hint: string, calendar: boolean): Promise<{ code: string; scope: string }> {
  const oauth2 = window.google!.accounts.oauth2;
  return new Promise((resolve, reject) => {
    const client = oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      // One window, one grant: with Calendar on, both permissions are asked for together.
      scope: calendar ? `${GOOGLE_SCOPE} ${CALENDAR_SCOPE}` : GOOGLE_SCOPE,
      ux_mode: "popup",
      ...(hint ? { login_hint: hint } : {}),
      callback: (response) => {
        if (response.error || !response.code) {
          reject(new Error(describeError(response.error, response.error_description)));
          return;
        }
        resolve({ code: response.code, scope: response.scope ?? "" });
      },
      error_callback: (error) => reject(new Error(describeError(error.type, error.message)))
    });
    client.requestCode();
  });
}

export function forgetToken() {
  storeToken(null);
  storeCalendarToken(null);
}

export async function revokeToken(token: string) {
  forgetToken();
  try {
    await loadScript();
    await new Promise<void>((resolve) => window.google!.accounts.oauth2.revoke(token, resolve));
  } catch {
    // Revoking is best effort; the token expires within the hour regardless.
  }
}

export interface ExtensionSession {
  token: StoredToken;
  account: Account;
  /** The extension's own ("You") Letterboxd profile, "" when it has none. */
  letterboxd: string;
}

/** Whether this browser has a FlickCue extension that could lend its session. */
export function canAskExtension(): boolean {
  return typeof window !== "undefined" && typeof window.chrome?.runtime?.sendMessage === "function";
}

function askOneExtension(id: string): Promise<unknown> {
  return new Promise((resolve) => {
    // The extension syncs before answering, for up to a few seconds.
    const timer = setTimeout(() => resolve(null), 7000);
    try {
      window.chrome!.runtime!.sendMessage!(id, { type: "FLICKCUE_WEB_SESSION" }, (response) => {
        clearTimeout(timer);
        // Reading it marks "not installed" as handled rather than logged.
        void window.chrome?.runtime?.lastError;
        resolve(response ?? null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * Asks the FlickCue extension, if it's installed and signed in, for a
 * short-lived Drive token. Nothing is shown to the user and nothing is stored
 * until the caller decides to use it.
 */
export async function requestExtensionSession(): Promise<ExtensionSession | null> {
  if (!canAskExtension()) return null;
  for (const id of EXTENSION_IDS) {
    const reply = await askOneExtension(id) as {
      signedIn?: boolean; accessToken?: unknown; expiresAt?: unknown; account?: Partial<Account>; letterboxd?: { username?: unknown } | null;
    } | null;
    if (!reply?.signedIn || typeof reply.accessToken !== "string" || !reply.accessToken) continue;
    const expiresAt = Number(reply.expiresAt);
    if (!(expiresAt - EXPIRY_MARGIN > Date.now())) continue;
    return {
      token: { accessToken: reply.accessToken, expiresAt, source: "extension" },
      account: {
        email: String(reply.account?.email ?? ""),
        name: String(reply.account?.name ?? ""),
        photo: /^https:\/\//.test(String(reply.account?.photo ?? "")) ? String(reply.account?.photo) : ""
      },
      letterboxd: letterboxdHandle(reply.letterboxd?.username)
    };
  }
  return null;
}
