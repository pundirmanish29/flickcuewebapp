// Google sign-in through Google Identity Services' token model. A web page
// can't keep a client secret or a refresh token safely, so it holds only a
// short-lived access token (about an hour) and asks Google for a new one when
// it runs out. After the first consent that is a popup that closes by itself.

import { GOOGLE_CLIENT_ID, GOOGLE_SCOPE } from "./config";

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

const TOKEN_KEY = "flickcue.googleToken";
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
}

export function getStoredToken(): StoredToken | null {
  try {
    const token = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null") as StoredToken | null;
    if (token?.accessToken && token.expiresAt - EXPIRY_MARGIN > Date.now()) return token;
  } catch {
    // Unreadable storage just means signing in again.
  }
  return null;
}

function storeToken(token: StoredToken | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private windows can refuse storage; the token then lasts for this page only.
  }
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
export async function requestToken({ consent = false, hint = "" } = {}): Promise<StoredToken> {
  await loadScript();
  const oauth2 = window.google!.accounts.oauth2;

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(describeError(response.error, response.error_description)));
          return;
        }
        const token = {
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000
        };
        storeToken(token);
        resolve(token);
      },
      error_callback: (error) => reject(new Error(describeError(error.type, error.message)))
    });
    client.requestAccessToken({ prompt: consent ? "consent" : "", ...(hint ? { login_hint: hint } : {}) });
  });
}

export function forgetToken() {
  storeToken(null);
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
