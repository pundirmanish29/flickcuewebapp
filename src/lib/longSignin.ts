// Staying signed in past Google's one-hour access token. A web page can't keep a client secret, so the
// title service (the Cloudflare Worker that already holds the extension's) swaps Google's one-time code for
// tokens and renews access when asked. The browser keeps only the long-lived refresh token, in this
// device's storage; the service keeps nothing. Off unless the build sets VITE_LONG_SIGNIN=1.

import { requestCode, storeToken, type StoredToken } from "./auth";
import { PROXY_BASE_URL } from "./config";

const GRANT_KEY = "flickcue.refreshGrant";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const TIMEOUT = 20_000;

export interface RefreshGrant {
  token: string;
  savedAt: number;
}

export function getGrant(): RefreshGrant | null {
  try {
    const grant = JSON.parse(localStorage.getItem(GRANT_KEY) || "null") as RefreshGrant | null;
    return grant && typeof grant.token === "string" && grant.token ? grant : null;
  } catch {
    return null;
  }
}

function storeGrant(token: string) {
  try {
    localStorage.setItem(GRANT_KEY, JSON.stringify({ token, savedAt: Date.now() } satisfies RefreshGrant));
  } catch {
    // Without storage the sign-in lasts as long as the access token, as it does without this feature.
  }
}

export function forgetGrant() {
  try {
    localStorage.removeItem(GRANT_KEY);
  } catch {
    // Nothing to forget.
  }
}

interface TokenReply {
  access_token?: string;
  expires_in?: number | string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function post(path: string, body: Record<string, string>): Promise<{ status: number; data: TokenReply }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(`${PROXY_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = (await response.json().catch(() => ({}))) as TokenReply;
    return { status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function asToken(reply: TokenReply): StoredToken {
  return {
    accessToken: String(reply.access_token),
    expiresAt: Date.now() + Number(reply.expires_in ?? 3600) * 1000,
    source: "google",
    ...(reply.scope ? { scope: reply.scope } : {})
  };
}

/**
 * Sign-in with a long-lived grant: Google's window gives a code, the title service turns it into tokens, the
 * access token is stored as usual and the refresh token alongside. Must be called from a click.
 * With no refresh token in the reply (Google only sends one when it newly asks for offline access) any grant
 * already held is kept, and this sign-in lasts an hour like any other.
 */
export async function signInForLong(hint = ""): Promise<StoredToken> {
  const { code } = await requestCode({ hint });
  let reply: { status: number; data: TokenReply };
  try {
    reply = await post("/oauth/token", { code, redirect_uri: location.origin });
  } catch {
    throw new Error("Couldn't finish signing in. Check your connection and try again.");
  }
  if (reply.status !== 200 || !reply.data.access_token) {
    throw new Error(reply.data.error_description || reply.data.error || "Couldn't finish signing in.");
  }
  const token = asToken(reply.data);
  storeToken(token);
  if (reply.data.refresh_token) storeGrant(reply.data.refresh_token);
  return token;
}

export type Renewal =
  | { ok: true; token: StoredToken }
  /** none: no grant held. revoked: Google no longer honours it (cleared). offline: couldn't ask; try again later. */
  | { ok: false; reason: "none" | "revoked" | "offline" };

/** A fresh access token from the held grant, with nothing shown to the person. */
export async function renewAccess(): Promise<Renewal> {
  const grant = getGrant();
  if (!grant) return { ok: false, reason: "none" };
  let reply: { status: number; data: TokenReply };
  try {
    reply = await post("/oauth/refresh", { refresh_token: grant.token });
  } catch {
    return { ok: false, reason: "offline" };
  }
  if (reply.status === 200 && reply.data.access_token) {
    const token = asToken(reply.data);
    storeToken(token);
    return { ok: true, token };
  }
  // Google says the grant is gone (removed at myaccount.google.com, unused for months, password change...).
  if (reply.data.error === "invalid_grant") {
    forgetGrant();
    return { ok: false, reason: "revoked" };
  }
  // The service or Google had a bad moment, or this site isn't allowed through yet: the grant is kept.
  return { ok: false, reason: "offline" };
}

/** Signing out: Google is told to void the grant (best effort), and this device forgets it either way. */
export async function revokeGrant() {
  const grant = getGrant();
  forgetGrant();
  if (!grant) return;
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: grant.token }).toString(),
      signal: AbortSignal.timeout(TIMEOUT)
    });
  } catch {
    // Offline: the grant is gone from this device regardless.
  }
}
