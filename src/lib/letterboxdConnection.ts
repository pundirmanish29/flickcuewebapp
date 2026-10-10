import { EXTENSION_IDS } from "./config";
import { letterboxdHandle } from "./letterboxd";

export const LETTERBOXD_IMPORTS = {
  watched: "Watched films", diary: "Diary dates", ratings: "Stars and likes", reviews: "Reviews", watchlist: "Watchlist"
} as const;
type ImportKey = keyof typeof LETTERBOXD_IMPORTS;

export interface LetterboxdConnection {
  username: string;
  displayName: string;
  avatarUrl: string;
  scope: Record<ImportKey, boolean>;
  syncedAt: number;
  lastError: string;
  counts: { films?: number; watchlist?: number };
  progress: { active: boolean; startedAt: number; processed: number; total: number } | null;
}

export type LetterboxdStatusResult = { profile: LetterboxdConnection; reason?: never } | {
  profile: null;
  reason: "unavailable" | "signed-out" | "other-account" | "profile-mismatch" | "not-configured";
};

const number = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;

/** Only Letterboxd's image hosts; an extension response must not make the browser load arbitrary URLs. */
export function letterboxdAvatar(raw: unknown): string {
  if (typeof raw !== "string") return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ["a.ltrbxd.com", "s.ltrbxd.com"].includes(url.hostname) && !url.username && !url.password && !url.port ? url.href : "";
  } catch { return ""; }
}

/** Accept status only for this Google account and the profile currently linked on the website. */
export function readLetterboxdStatus(raw: unknown, email: string, username: string): LetterboxdStatusResult {
  const reply = raw as { ok?: boolean; signedIn?: boolean; accountEmail?: unknown; profile?: Partial<LetterboxdConnection> } | null;
  if (reply?.ok !== true) return { profile: null, reason: "unavailable" };
  if (reply.signedIn !== true) return { profile: null, reason: "signed-out" };
  if (!email.trim() || typeof reply.accountEmail !== "string" || reply.accountEmail.trim().toLowerCase() !== email.trim().toLowerCase()) return { profile: null, reason: "other-account" };
  const profile = reply.profile;
  if (!profile) return { profile: null, reason: "not-configured" };
  if (!username || letterboxdHandle(profile.username) !== username) return { profile: null, reason: "profile-mismatch" };
  return { profile: {
    username,
    displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 100) : "",
    avatarUrl: letterboxdAvatar(profile.avatarUrl),
    scope: Object.fromEntries(Object.keys(LETTERBOXD_IMPORTS).map(key => [key, profile.scope?.[key as ImportKey] === true])) as Record<ImportKey, boolean>,
    syncedAt: number(profile.syncedAt),
    lastError: typeof profile.lastError === "string" ? profile.lastError.slice(0, 500) : "",
    counts: { ...(typeof profile.counts?.films === "number" ? { films: number(profile.counts.films) } : {}), ...(typeof profile.counts?.watchlist === "number" ? { watchlist: number(profile.counts.watchlist) } : {}) },
    progress: profile.progress && typeof profile.progress === "object" ? {
      active: profile.progress.active === true, startedAt: number(profile.progress.startedAt),
      processed: number(profile.progress.processed), total: number(profile.progress.total)
    } : null
  } };
}

/** This message reads cached status only; it never obtains Google tokens or changes either list. */
export async function requestLetterboxdStatus(email: string, username: string): Promise<LetterboxdStatusResult> {
  if (typeof window === "undefined" || typeof window.chrome?.runtime?.sendMessage !== "function") return { profile: null, reason: "unavailable" };
  let result: LetterboxdStatusResult = { profile: null, reason: "unavailable" };
  for (const id of EXTENSION_IDS) {
    const raw = await new Promise<unknown>(resolve => {
      const timer = setTimeout(() => resolve(null), 2000);
      try {
        window.chrome!.runtime!.sendMessage!(id, { type: "FLICKCUE_WEB_LETTERBOXD_STATUS" }, response => {
          clearTimeout(timer);
          void window.chrome?.runtime?.lastError;
          resolve(response ?? null);
        });
      } catch { clearTimeout(timer); resolve(null); }
    });
    const next = readLetterboxdStatus(raw, email, username);
    if (next.profile) return next;
    if (next.reason !== "unavailable") result = next;
  }
  return result;
}

export type LetterboxdSyncResult = { ok: true; profile: LetterboxdConnection } | { ok: false; error: string };

/** User-initiated import. Probe first so only one matching extension receives a write. */
export async function requestLetterboxdSync(email: string, username: string, enable = false): Promise<LetterboxdSyncResult> {
  const unavailable = { ok: false as const, error: "Open this page in Chrome or Edge with the updated FlickCue extension installed." };
  if (!email.trim() || !letterboxdHandle(username)) return { ok: false, error: "Sign in and link your Letterboxd profile first." };
  if (typeof window === "undefined" || typeof window.chrome?.runtime?.sendMessage !== "function") return unavailable;
  const send = (id: string, message: object, timeout = 2000) => new Promise<unknown>(resolve => {
    const timer = setTimeout(() => resolve(null), timeout);
    try {
      window.chrome!.runtime!.sendMessage!(id, message, response => {
        clearTimeout(timer); void window.chrome?.runtime?.lastError; resolve(response ?? null);
      });
    } catch { clearTimeout(timer); resolve(null); }
  });
  for (const id of EXTENSION_IDS) {
    const status = readLetterboxdStatus(await send(id, { type: "FLICKCUE_WEB_LETTERBOXD_STATUS" }), email, username);
    if (!status.profile && status.reason !== "not-configured") continue;
    const raw = await send(id, { type: "FLICKCUE_WEB_LETTERBOXD_SYNC", accountEmail: email, username, enable }, 10_000) as { accepted?: boolean; error?: unknown } | null;
    const result = readLetterboxdStatus(raw, email, username);
    if (raw?.accepted === true && result.profile) return { ok: true, profile: result.profile };
    // Don't retry a write against another extension after a timeout: it may have started.
    return { ok: false, error: typeof raw?.error === "string" ? raw.error.slice(0, 500) : "Couldn't confirm that the import started. Refresh status before trying again; reload the updated extension if needed." };
  }
  return unavailable;
}

export function letterboxdSyncState(profile: LetterboxdConnection, now = Date.now()): "Syncing" | "Interrupted" | "Needs attention" | "Synced" | "Waiting for first sync" {
  if (profile.progress?.active) return profile.progress.startedAt > 0 && profile.progress.startedAt <= now && now - profile.progress.startedAt < 10 * 60_000 ? "Syncing" : "Interrupted";
  if (profile.lastError) return "Needs attention";
  return profile.syncedAt ? "Synced" : "Waiting for first sync";
}
