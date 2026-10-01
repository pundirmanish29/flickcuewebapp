// The web app's single source of truth: the library document (kept in
// localStorage so the app works offline and before sign-in), the sync state,
// and settings. Components read it through useLibrary() and change it only
// through the editor functions, which is what keeps every edit sync-safe.

import { useSyncExternalStore } from "react";
import { canAskExtension, getCalendarToken, getStoredToken, forgetToken, grantsCalendar, requestExtensionSession, requestToken, revokeToken, storeCalendarToken, storeToken } from "./auth";
import { createCalendarMirror, type CalendarState, type PersistedCalendar } from "./calendarMirror";
import { CALENDAR_MIRROR_ENABLED } from "./config";
import { needsConfirmation, newRemovals } from "./syncGuard";
import { DriveError, fetchAccount, fileVersion, findRemoteFileId, findSettingsFileId, readRemote, readRemoteSettings, writeRemote, writeRemoteSettings, type Account } from "./drive";
import { readSynced, settingsDirection, SYNCED_KEYS, type SyncedSettings } from "./settingsSync";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "./theme";
import { mergeWatchlists } from "./merge";
import { airDateShiftDays } from "./regions";
import { setScheduleShift } from "./rules";
import { setContentLanguage } from "./tmdb";
import type { LibraryDocument, SortMode } from "./types";

const LIBRARY_KEY = "flickcue.library";
const SYNC_KEY = "flickcue.sync";
const SETTINGS_KEY = "flickcue.settings";
const CALENDAR_STATE_KEY = "flickcue.calendarState";
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
  /** flickcue-settings.json, beside the list in Drive. */
  settingsFileId?: string;
  account: Account | null;
  lastSyncAt: number;
  status: SyncStatus;
  error: string;
  /** Titles a sync would remove from Drive, held until the reader confirms (lib/syncGuard.ts). */
  held?: number;
}

export interface Settings {
  region: string;
  notifications: boolean;
  /** The link to a Letterboxd profile; synced between this app's devices through flickcue-settings.json. */
  letterboxd: string;
  /** The reader's city for showtimes: a listed city's id, or a place typed by name. Kept on this device. */
  city: string;
  /** Unlinked here on purpose, so the extension's profile isn't linked again at the next sign-in. */
  letterboxdUnlinked: boolean;
  theme?: ThemeChoice;
  /** The Queue's sort, synced like the rest. */
  sort?: SortMode;
  /** The language TMDB titles and overviews come in, synced like the rest. */
  language?: string;
  /** Reminders are mirrored into the FlickCue calendar in Google Calendar; off until switched on. Synced. */
  calendarMirror?: boolean;
  /** Google's id of the FlickCue calendar once it exists. Synced, so another device uses it instead of making a second. */
  calendarId?: string;
  /** When a synced setting last changed here, or was taken from Drive; 0 for never. */
  settingsUpdatedAt?: number;
}

export interface AppState {
  library: LibraryDocument;
  sync: SyncState;
  settings: Settings;
  /** Where mirroring reminders into Google Calendar stands; "off" unless switched on (and the site is built with it). */
  calendar: CalendarState;
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

/** Hands the settings that shape lookups and calendars to the modules that use them. */
function applyRegionAndLanguage(settings: Settings) {
  setScheduleShift(airDateShiftDays(settings.region));
  setContentLanguage(settings.language ?? "en-US");
}

function initialState(onLoad = true): AppState {
  const library = read<LibraryDocument>(LIBRARY_KEY, { movies: [], deleted: [] });
  const stored = read<Partial<SyncState>>(SYNC_KEY, {});
  const settings = read<Settings>(SETTINGS_KEY, { region: "IN", notifications: false, letterboxd: "", letterboxdUnlinked: false, city: "" });
  return {
    library: {
      movies: Array.isArray(library.movies) ? library.movies : [],
      deleted: Array.isArray(library.deleted) ? library.deleted : []
    },
    sync: {
      connected: Boolean(stored.connected),
      fileId: stored.fileId ?? "",
      settingsFileId: stored.settingsFileId ?? "",
      account: stored.account ?? null,
      lastSyncAt: stored.lastSyncAt ?? 0,
      status: stored.connected ? (getStoredToken() ? "idle" : "needs-auth") : onLoad && willAskExtension() ? "connecting" : "local",
      error: ""
    },
    settings,
    calendar: { status: "off", message: "", held: 0, mirrored: [], declined: false }
  };
}

let state: AppState = initialState();
applyRegionAndLanguage(state.settings);
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
  // Every change to the reminders passes through here, whether made here, merged from Drive, imported or restored.
  calendarMirror.schedule();
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

/**
 * Changes settings on this device. A change to one that syncs (region, city,
 * Letterboxd, theme) is stamped and pushed to Drive with the next sync.
 */
export function updateSettings(patch: Partial<Settings>, fromDrive = false) {
  const changesSynced = !fromDrive && SYNCED_KEYS.some((key) => key in patch && patch[key] !== state.settings[key]);
  const settings = { ...state.settings, ...patch, ...(changesSynced ? { settingsUpdatedAt: Date.now() } : {}) };
  write(SETTINGS_KEY, settings);
  applyRegionAndLanguage(settings);
  setState({ settings });
  if (changesSynced && state.sync.connected) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void sync(), PUSH_DELAY);
  }
}

// A Drive sync has succeeded in this page session: only then is the library known to be whole enough to compare
// the calendar with (an empty library before the first sync would otherwise look like "delete everything").
let syncedOnce = false;

const calendarMirror = createCalendarMirror({
  getLibrary: () => state.library,
  // Off entirely unless this build has the feature, whatever another device's synced switch says.
  getSettings: () => ({ calendarMirror: CALENDAR_MIRROR_ENABLED && Boolean(state.settings.calendarMirror), calendarId: state.settings.calendarId ?? "" }),
  setSettings: (patch) => updateSettings(patch),
  syncReady: () => syncedOnce && !state.sync.held,
  account: () => state.sync.account?.email ?? "",
  getToken: getCalendarToken,
  dropToken: () => storeCalendarToken(null),
  load: () => {
    try {
      return JSON.parse(localStorage.getItem(CALENDAR_STATE_KEY) || "null") as PersistedCalendar | null;
    } catch {
      return null;
    }
  },
  save: (value) => {
    try {
      if (value) localStorage.setItem(CALENDAR_STATE_KEY, JSON.stringify(value));
      else localStorage.removeItem(CALENDAR_STATE_KEY);
    } catch {
      // Storage refused: the mirror works for this visit and looks again next time.
    }
  },
  onState: (calendar) => setState({ calendar }),
  now: () => Date.now(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
});
calendarMirror.restore();

/**
 * Turns on "Add reminders to Google Calendar". Must be called from a tap: Google's window opens right here, asking
 * for Drive and Calendar together.
 */
export async function enableCalendar() {
  if (!CALENDAR_MIRROR_ENABLED) return;
  const asked = requestToken({ consent: true, hint: state.sync.account?.email, calendar: true });
  try {
    const token = await asked;
    if (!grantsCalendar(token.scope)) {
      calendarMirror.declined();
      return;
    }
    updateSettings({ calendarMirror: true });
    await calendarMirror.started();
  } catch (error) {
    calendarMirror.notice(error instanceof Error ? error.message : "Google Calendar couldn't be connected.");
  }
}

/** Gets a live Calendar permission again (the sign-in lasts about an hour). Call it from a tap. */
export async function reconnectCalendar() {
  if (!CALENDAR_MIRROR_ENABLED) return;
  const asked = requestToken({ consent: calendarMirror.getState().declined, hint: state.sync.account?.email, calendar: true });
  try {
    const token = await asked;
    if (!grantsCalendar(token.scope)) {
      calendarMirror.declined();
      return;
    }
    await calendarMirror.started();
  } catch (error) {
    calendarMirror.notice(error instanceof Error ? error.message : "Google Calendar couldn't be connected.");
  }
}

/**
 * Turns the mirror off and deletes the FlickCue calendar. Deleting it needs a live permission, so without one this
 * asks Google first (call it from a tap). `removed` is false when the calendar had to be left.
 */
export async function disableCalendar(): Promise<{ removed: boolean }> {
  if (!getCalendarToken()) await requestToken({ hint: state.sync.account?.email, calendar: true }).catch(() => null);
  return calendarMirror.stop();
}

/** The ids of the events on the calendar, for a title to show it is there. Changes only when the calendar does. */
export function useCalendarMirrored(): string[] {
  return useSyncExternalStore(subscribe, () => state.calendar.mirrored, () => state.calendar.mirrored);
}

/** Looks at the calendar again now (after a failure it could not get past on its own). */
export function retryCalendar() {
  return calendarMirror.run();
}

/** Goes ahead with the deletes that were held for being too many. */
export function confirmCalendarDeletes() {
  return calendarMirror.run({ allowBulkDelete: true });
}

/** The light/dark choice: applied now, and synced like the other settings. */
export function chooseTheme(choice: ThemeChoice) {
  setThemeChoice(choice);
  updateSettings({ theme: choice });
}

function syncedSettings(): SyncedSettings {
  const { region, city, letterboxd, letterboxdUnlinked, sort, language, calendarMirror, calendarId } = state.settings;
  return {
    region, city, letterboxd, letterboxdUnlinked, theme: getThemeChoice(), sort: sort ?? "added", language: language ?? "en-US",
    calendarMirror: calendarMirror ?? false, calendarId: calendarId ?? ""
  };
}

/** Settings sync: whichever side changed last wins. Its failure never fails the list's sync. */
async function syncSettings(token: string) {
  try {
    const fileId = state.sync.settingsFileId || await findSettingsFileId(token);
    const remote = fileId ? await readRemoteSettings(fileId, token) : null;
    const direction = settingsDirection(Number(state.settings.settingsUpdatedAt) || 0, remote);
    if (direction === "pull" && remote) {
      const values = readSynced(remote.settings, syncedSettings());
      updateSettings({ ...values, settingsUpdatedAt: remote.updatedAt }, true);
      if (values.theme !== getThemeChoice()) setThemeChoice(values.theme);
    } else if (direction === "push") {
      // A device's first push is stamped now, so its other devices take it.
      const at = Number(state.settings.settingsUpdatedAt) || Date.now();
      if (!state.settings.settingsUpdatedAt) updateSettings({ settingsUpdatedAt: at }, true);
      const nextId = await writeRemoteSettings(fileId, token, at, { ...syncedSettings() });
      if (nextId !== state.sync.settingsFileId) patchSync({ settingsFileId: nextId });
      return;
    }
    if (fileId && fileId !== state.sync.settingsFileId) patchSync({ settingsFileId: fileId });
  } catch (error) {
    // A settings file removed elsewhere is found or made again next time.
    if (error instanceof DriveError && error.status === 404) patchSync({ settingsFileId: "" });
  }
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
  // The extension's Letterboxd profile links here too, unless one is already
  // linked or was unlinked on this device.
  if (session.letterboxd && !state.settings.letterboxd && !state.settings.letterboxdUnlinked) {
    updateSettings({ letterboxd: session.letterboxd });
  }
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

  patchSync({ status: "syncing", error: "", held: 0 });
  try {
    const fileId = state.sync.fileId || await findRemoteFileId(token.accessToken);
    let nextFileId = fileId;
    // Read, merge, and save only if Drive's copy is still the one read: when
    // another device saved in between, go round again with its copy.
    for (let attempt = 0; ; attempt++) {
      const version = fileId ? await fileVersion(fileId, token.accessToken) : "";
      const remote = fileId ? await readRemote(fileId, token.accessToken) : { movies: [], deleted: [] };
      // Read the local copy after the network round trip, so an edit made while
      // Drive was answering is part of the merge rather than overwritten by it.
      const local = state.library;
      const merged = mergeWatchlists(local, remote);

      // Many titles leaving Drive at once waits for a yes (Settings > Account).
      const removing = newRemovals(remote, merged);
      if (needsConfirmation(removing.length, remote.movies.length) && Date.now() > bulkRemovalAllowedUntil) {
        heldRemovals = removing;
        patchSync({ status: "error", held: removing.length, error: `Sync paused: this device would remove ${removing.length} titles from your list everywhere.` });
        return;
      }

      if (JSON.stringify(local) !== JSON.stringify(merged)) setLibrary(merged);

      const remoteChanged = JSON.stringify(remote.movies) !== JSON.stringify(merged.movies)
        || JSON.stringify(remote.deleted ?? []) !== JSON.stringify(merged.deleted);
      if (!remoteChanged && fileId) break;
      if (fileId && attempt < 3 && await fileVersion(fileId, token.accessToken) !== version) continue;
      nextFileId = await writeRemote(fileId, token.accessToken, merged);
      break;
    }
    const account = state.sync.account?.email ? state.sync.account : await fetchAccount(token.accessToken);

    await syncSettings(token.accessToken);
    patchSync({ fileId: nextFileId, account: account ?? state.sync.account, lastSyncAt: Date.now(), status: "idle", error: "" });
    syncedOnce = true;
    // Soon, not after the usual wait for a burst of edits: this is the moment the library is known to be whole.
    calendarMirror.schedule(300);
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
    // With the Calendar mirror on, Resume asks for Calendar too, so the hourly sign-in stays one window.
    const wantCalendar = CALENDAR_MIRROR_ENABLED && Boolean(state.settings.calendarMirror) && !calendarMirror.getState().declined;
    const token = await requestToken({ consent: !state.sync.connected, hint: state.sync.account?.email, calendar: wantCalendar });
    if (wantCalendar && !grantsCalendar(token.scope)) calendarMirror.declined();
    patchSync({ connected: true, status: "idle", error: "" });
    await sync();
  } catch (error) {
    patchSync({ status: state.sync.connected ? "needs-auth" : "local", error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * "Pick up from the extension": signs in with the FlickCue extension's Google session and syncs.
 * False when the extension has no session to lend (it isn't signed in), so the page can say so.
 * Someone who signed out here and now asks for it again is asking to be signed in, so that choice is undone.
 */
export async function connectWithExtension(): Promise<boolean> {
  setExtensionSignInOff(false);
  if (!(await adoptExtensionSession())) return false;
  await sync();
  return true;
}

/** Only the credentials go. The local list and the Drive copy both stay. */
export async function disconnect() {
  const token = getStoredToken();
  // A token the extension lent is only dropped: revoking it would sign the
  // extension out too.
  if (token && token.source !== "extension") await revokeToken(token.accessToken);
  else forgetToken();
  setExtensionSignInOff(true);
  // This device forgets the calendar; the calendar itself and the synced switch stay, so signing back in resumes.
  syncedOnce = false;
  calendarMirror.reset();
  patchSync({ connected: false, fileId: "", settingsFileId: "", account: null, lastSyncAt: 0, status: "local", error: "" });
}

let heldRemovals: string[] = [];
let bulkRemovalAllowedUntil = 0;

/**
 * The reader asked for a large removal here (Clear watched history), or
 * confirmed a held one: syncs in the next few minutes may remove many titles.
 */
export function allowBulkRemoval() {
  bulkRemovalAllowedUntil = Date.now() + 10 * 60 * 1000;
}

/** Confirms a held sync: the titles go from the list everywhere. */
export function confirmHeldRemoval() {
  allowBulkRemoval();
  heldRemovals = [];
  void sync();
}

/** Undoes a held sync's removals here, so the titles come back from Drive. */
export function keepHeldTitles() {
  const ids = new Set(heldRemovals);
  heldRemovals = [];
  setLibrary({ ...state.library, deleted: state.library.deleted.filter((entry) => !ids.has(entry.id)) });
  void sync();
}

/**
 * Brings back an earlier version of the list from Drive's history: its titles,
 * as they were then, win over today's (a fresh updatedAt beats a tombstone,
 * SHARED.md). Titles added since stay.
 */
export function restoreVersion(document: LibraryDocument, now = Date.now()) {
  const stamped = document.movies.map((movie) => ({ ...movie, updatedAt: now }));
  commit(mergeWatchlists(state.library, { movies: stamped, deleted: [] }, now));
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
      state = { ...initialState(false), calendar: state.calendar };
      emit();
    }
  });
}
