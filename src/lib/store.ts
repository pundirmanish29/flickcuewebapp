// The web app's single source of truth: the library document (kept in
// localStorage so the app works offline and before sign-in), the sync state,
// and settings. Components read it through useLibrary() and change it only
// through the editor functions, which is what keeps every edit sync-safe.

import { useSyncExternalStore } from "react";
import { canAskExtension, getStoredToken, forgetToken, requestExtensionSession, requestToken, revokeToken, storeToken } from "./auth";
import { DriveError, fetchAccount, findRemoteFileId, readRemote, writeRemote, type Account } from "./drive";
import { mergeWatchlists } from "./merge";
import type { LibraryDocument } from "./types";

const LIBRARY_KEY = "flickcue.library";
const SYNC_KEY = "flickcue.sync";
const SETTINGS_KEY = "flickcue.settings";
// Set when someone signs out here, so the extension's session isn't picked up
// again on the next visit; signing in here clears it.
const EXTENSION_OFF_KEY = "flickcue.extensionSignInOff";

const PUSH_DELAY = 4000;
const POLL_INTERVAL = 5 * 60 * 1000;

// "connecting": asking the FlickCue extension for its session on load.
export type SyncStatus = "local" | "connecting" | "idle" | "syncing" | "needs-auth" | "error";

export interface SyncState {
  connected: boolean;
  fileId: string;
  account: Account | null;
  lastSyncAt: number;
  status: SyncStatus;
  error: string;
}

export interface Settings {
  region: string;
  notifications: boolean;
}

export interface AppState {
  library: LibraryDocument;
  sync: SyncState;
  settings: Settings;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or refused: the in-memory copy still works for this visit.
  }
}

function extensionSignInOff(): boolean {
  try {
    return localStorage.getItem(EXTENSION_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

function setExtensionSignInOff(off: boolean) {
  try {
    if (off) localStorage.setItem(EXTENSION_OFF_KEY, "1");
    else localStorage.removeItem(EXTENSION_OFF_KEY);
  } catch {
    // Without storage the choice lasts for this visit only.
  }
}

/** Whether a first visit should wait for the extension before showing the signed-out page. */
function willAskExtension(): boolean {
  return canAskExtension() && !extensionSignInOff();
}

function initialState(onLoad = true): AppState {
  const library = read<LibraryDocument>(LIBRARY_KEY, { movies: [], deleted: [] });
  const stored = read<Partial<SyncState>>(SYNC_KEY, {});
  const settings = read<Settings>(SETTINGS_KEY, { region: "IN", notifications: false });
  return {
    library: {
      movies: Array.isArray(library.movies) ? library.movies : [],
      deleted: Array.isArray(library.deleted) ? library.deleted : []
    },
    sync: {
      connected: Boolean(stored.connected),
      fileId: stored.fileId ?? "",
      account: stored.account ?? null,
      lastSyncAt: stored.lastSyncAt ?? 0,
      status: stored.connected ? (getStoredToken() ? "idle" : "needs-auth") : onLoad && willAskExtension() ? "connecting" : "local",
      error: ""
    },
    settings
  };
}

let state: AppState = initialState();
const listeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let activeSync: Promise<void> | null = null;
let syncAgain = false;

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  emit();
}

function persistSync(sync: SyncState) {
  const { status: _status, error: _error, ...durable } = sync;
  write(SYNC_KEY, durable);
}

function patchSync(patch: Partial<SyncState>) {
  const sync = { ...state.sync, ...patch };
  persistSync(sync);
  setState({ sync });
}

function setLibrary(library: LibraryDocument) {
  write(LIBRARY_KEY, library);
  setState({ library });
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Saves an edited document and schedules a push to Drive. */
export function commit(library: LibraryDocument) {
  setLibrary(library);
  if (state.sync.connected) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void sync(), PUSH_DELAY);
  }
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  write(SETTINGS_KEY, settings);
  setState({ settings });
}

/**
 * Reconciles with Drive exactly as the extension does: read, merge, write
 * back only what changed. Serialised, so a manual sync can't interleave with
 * a scheduled one and write a half-merged list.
 */
export function sync(): Promise<void> {
  if (activeSync) {
    syncAgain = true;
    return activeSync;
  }
  activeSync = runSync().finally(() => {
    activeSync = null;
    if (syncAgain) {
      syncAgain = false;
      void sync();
    }
  });
  return activeSync;
}

/**
 * Signs in with the FlickCue extension's Google session when it has one: a
 * short-lived Drive token for the same app-data folder, lent by message. It
 * never replaces a different account already signed in here.
 */
async function adoptExtensionSession(): Promise<boolean> {
  if (!willAskExtension()) return false;
  const session = await requestExtensionSession();
  if (!session) return false;
  const current = state.sync.account?.email?.toLowerCase();
  const offered = session.account.email.toLowerCase();
  if (state.sync.connected && current && offered && current !== offered) return false;
  storeToken(session.token);
  patchSync({
    connected: true,
    account: session.account.email ? session.account : state.sync.account,
    status: "idle",
    error: ""
  });
  return true;
}

async function runSync() {
  if (!state.sync.connected) return;
  // An expired token is renewed from the extension when it can be, so only
  // someone without it is asked to reconnect.
  const token = getStoredToken() ?? (await adoptExtensionSession() ? getStoredToken() : null);
  if (!token) {
    patchSync({ status: "needs-auth", error: "" });
    return;
  }

  patchSync({ status: "syncing", error: "" });
  try {
    const fileId = state.sync.fileId || await findRemoteFileId(token.accessToken);
    const remote = fileId ? await readRemote(fileId, token.accessToken) : { movies: [], deleted: [] };
    // Read the local copy after the network round trip, so an edit made while
    // Drive was answering is part of the merge rather than overwritten by it.
    const local = state.library;
    const merged = mergeWatchlists(local, remote);

    if (JSON.stringify(local) !== JSON.stringify(merged)) setLibrary(merged);

    const remoteChanged = JSON.stringify(remote.movies) !== JSON.stringify(merged.movies)
      || JSON.stringify(remote.deleted ?? []) !== JSON.stringify(merged.deleted);
    const nextFileId = remoteChanged || !fileId ? await writeRemote(fileId, token.accessToken, merged) : fileId;
    const account = state.sync.account?.email ? state.sync.account : await fetchAccount(token.accessToken);

    patchSync({ fileId: nextFileId, account: account ?? state.sync.account, lastSyncAt: Date.now(), status: "idle", error: "" });
  } catch (error) {
    if (error instanceof DriveError && error.status === 401) {
      forgetToken();
      patchSync({ status: "needs-auth", error: "" });
      return;
    }
    if (error instanceof DriveError && error.status === 404) {
      // The file was removed by another client; the next sync creates it again.
      patchSync({ fileId: "", status: "error", error: "The synced list moved. Sync again to recreate it." });
      return;
    }
    patchSync({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
}

/** First sign-in: shows Google's consent screen, then syncs. */
export async function connect() {
  setExtensionSignInOff(false);
  try {
    await requestToken({ consent: !state.sync.connected, hint: state.sync.account?.email });
    patchSync({ connected: true, status: "idle", error: "" });
    await sync();
  } catch (error) {
    patchSync({ status: state.sync.connected ? "needs-auth" : "local", error: error instanceof Error ? error.message : String(error) });
  }
}

/** Only the credentials go. The local list and the Drive copy both stay. */
export async function disconnect() {
  const token = getStoredToken();
  // A token the extension lent is only dropped: revoking it would sign the
  // extension out too.
  if (token && token.source !== "extension") await revokeToken(token.accessToken);
  else forgetToken();
  setExtensionSignInOff(true);
  patchSync({ connected: false, fileId: "", account: null, lastSyncAt: 0, status: "local", error: "" });
}

/** Replaces the library with an imported backup, then lets sync merge it. */
export function importLibrary(document: LibraryDocument) {
  const merged = mergeWatchlists(state.library, document);
  commit(merged);
}

let started = false;

/** Syncs on load, when the tab comes back into view, and every few minutes. */
export function startBackgroundSync() {
  if (started) return;
  started = true;
  if (!state.sync.connected && state.sync.status === "connecting") {
    void adoptExtensionSession()
      .then((adopted) => {
        if (adopted) return sync();
        patchSync({ status: "local" });
      })
      .catch(() => patchSync({ status: "local" }));
  } else {
    void sync();
  }
  setInterval(() => {
    if (document.visibilityState === "visible") void sync();
  }, POLL_INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  // Another tab of this app edited the library or signed in.
  window.addEventListener("storage", (event) => {
    if (event.key === LIBRARY_KEY || event.key === SYNC_KEY || event.key === SETTINGS_KEY) {
      state = initialState(false);
      emit();
    }
  });
}
