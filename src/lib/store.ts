// The web app's single source of truth: the library document (kept in
// localStorage so the app works offline and before sign-in), the sync state,
// and settings. Components read it through useLibrary() and change it only
// through the editor functions, which is what keeps every edit sync-safe.

import { useSyncExternalStore } from "react";
import { canAskExtension, getCalendarToken, getStoredToken, forgetToken, grantsCalendar, requestExtensionSession, requestToken, revokeToken, storeCalendarToken, storeToken } from "./auth";
import { createCalendarMirror, type CalendarState, type PersistedCalendar } from "./calendarMirror";
import { CALENDAR_MIRROR_ENABLED, LONG_SIGNIN_ENABLED } from "./config";
import { acceptLongSignIn, getGrant, renewAccess, revokeGrant, signInForLong } from "./longSignin";
import { needsConfirmation, newRemovals } from "./syncGuard";
import { deleteAppFile, downloadAppFile, DriveError, fetchAccount, fileVersion, findRemoteFileId, findSettingsFileId, readRemote, readRemoteSettings, uploadAppFile, writeRemote, writeRemoteSettings, type Account } from "./drive";
import { clearBooking, setBooking } from "./editor";
import { cacheTicket, cachedTicket, forgetAllTickets, forgetTicket } from "./ticketCache";
import { readSynced, settingsDirection, SYNCED_KEYS, type SyncedSettings } from "./settingsSync";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "./theme";
import { mergeWatchlists } from "./merge";
import { airDateShiftDays } from "./regions";
import { setScheduleShift } from "./rules";
import { setContentLanguage } from "./tmdb";
import type { Booking, LibraryDocument, SortMode } from "./types";

const LIBRARY_KEY = "flickcue.library";
const SYNC_KEY = "flickcue.sync";
const SETTINGS_KEY = "flickcue.settings";
const CALENDAR_STATE_KEY = "flickcue.calendarState";
// Kept across sign-out: a known account's local data must never be silently
// uploaded into another account. Old anonymous libraries still merge once.
const LIBRARY_ACCOUNT_KEY = "flickcue.libraryAccount";
// Set when someone signs out here, so the extension's session isn't picked up
// again on the next visit; signing in here clears it.
const EXTENSION_OFF_KEY = "flickcue.extensionSignInOff";

const PUSH_DELAY = 4000;
const POLL_INTERVAL = 5 * 60 * 1000;
const SYNC_CONFLICT_ATTEMPTS = 4;
const SYNC_CONFLICT_MESSAGE = "Your list changed on another device during sync. Your changes are safe here; sync again shortly.";

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

/** A long-lived grant (when the build has the feature) renews access by itself, so an expired access token is no pause. */
function holdsGrant(): boolean {
  return LONG_SIGNIN_ENABLED && Boolean(getGrant());
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
      status: stored.connected ? (getStoredToken() || holdsGrant() ? "idle" : "needs-auth") : onLoad && willAskExtension() ? "connecting" : "local",
      error: ""
    },
    settings,
    calendar: { status: "off", message: "", held: 0, mirrored: [], declined: false }
  };
}

let state: AppState = initialState();
let sessionGeneration = 0;
let accountChanging = false;
let retainedAccount = String(state.sync.account?.email || "").toLowerCase();

/** Async UI work is discarded if sign-in or sign-out happened meanwhile. */
export function getSessionGeneration() { return sessionGeneration; }

function libraryAccount(): string {
  try {
    return String(localStorage.getItem(LIBRARY_ACCOUNT_KEY) || retainedAccount || "").toLowerCase();
  } catch {
    return retainedAccount;
  }
}

function rememberAccount(account: Account) {
  const email = account.email.trim().toLowerCase();
  if (!email) throw new Error("Couldn't verify your Google account. Try signing in again.");
  const owner = libraryAccount();
  if (owner && owner !== email) {
    throw new Error(`This browser keeps your list for ${owner}. Sign in with that account, or use a separate browser profile for another account.`);
  }
  retainedAccount = email;
  try { localStorage.setItem(LIBRARY_ACCOUNT_KEY, email); } catch { /* the in-memory account still guards this visit */ }
}
if (state.sync.account?.email) {
  try { rememberAccount(state.sync.account); } catch { /* a mismatched stored session must reconnect */ }
}
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
 * Asks Google in a window: the long-lived sign-in when this build has it (one grant for Drive and, when asked,
 * Calendar), otherwise the one-hour token sign-in. Call it from a tap, and call it first: the window opens right here.
 */
function askGoogle({ consent, calendar }: { consent: boolean; calendar: boolean }) {
  const generation = ++sessionGeneration;
  accountChanging = true;
  // Google's popup still opens inside the original tap. Credentials stay
  // staged until Drive has identified the selected account.
  const asked = LONG_SIGNIN_ENABLED
    ? signInForLong(state.sync.account?.email, calendar, false)
    : requestToken({ consent, hint: state.sync.account?.email, calendar, persist: false });
  return asked.then(async (token) => {
    const account = await fetchAccount(token.accessToken);
    if (generation !== sessionGeneration) throw new Error("Sign-in changed while Google was answering. Try again.");
    if (!account) throw new Error("Couldn't verify your Google account. Try signing in again.");
    rememberAccount(account);
    if (LONG_SIGNIN_ENABLED) acceptLongSignIn(token);
    else {
      storeToken(token);
      if (grantsCalendar(token.scope)) storeCalendarToken(token);
    }
    patchSync({ account });
    return token;
  }).finally(() => {
    if (generation === sessionGeneration) accountChanging = false;
  });
}

/**
 * Turns on "Add reminders to Google Calendar". Must be called from a tap: Google's window opens right here, asking
 * for Drive and Calendar together.
 */
export async function enableCalendar() {
  if (!CALENDAR_MIRROR_ENABLED) return;
  const asked = askGoogle({ consent: true, calendar: true });
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
  const asked = askGoogle({ consent: calendarMirror.getState().declined, calendar: true });
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
  if (!getCalendarToken() && LONG_SIGNIN_ENABLED && getGrant()) await renewAccess();
  if (!getCalendarToken()) await askGoogle({ consent: false, calendar: true }).catch(() => null);
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
  const generation = sessionGeneration;
  const currentSession = () => !accountChanging && state.sync.connected && generation === sessionGeneration;
  try {
    let fileId = state.sync.settingsFileId || await findSettingsFileId(token);
    for (let attempt = 0; attempt < SYNC_CONFLICT_ATTEMPTS; attempt++) {
      const version = fileId ? await fileVersion(fileId, token) : "";
      const remote = fileId ? await readRemoteSettings(fileId, token) : null;
      if (fileId && await fileVersion(fileId, token) !== version) continue;
      if (!currentSession()) return;
      const direction = settingsDirection(Number(state.settings.settingsUpdatedAt) || 0, remote);
      if (direction === "pull" && remote) {
        const values = readSynced(remote.settings, syncedSettings());
        updateSettings({ ...values, settingsUpdatedAt: remote.updatedAt }, true);
        if (values.theme !== getThemeChoice()) setThemeChoice(values.theme);
      } else if (direction === "push") {
        const at = Number(state.settings.settingsUpdatedAt) || Date.now();
        if (!state.settings.settingsUpdatedAt) updateSettings({ settingsUpdatedAt: at }, true);
        if (fileId && await fileVersion(fileId, token) !== version) continue;
        if (!currentSession()) return;
        if (Number(state.settings.settingsUpdatedAt) !== at) continue;
        fileId = await writeRemoteSettings(fileId, token, at, { ...syncedSettings() });
        if (!currentSession()) return;
        if (fileId !== state.sync.settingsFileId) patchSync({ settingsFileId: fileId });
        // Reconcile a remote or local setting changed during the upload.
        const echoed = await readRemoteSettings(fileId, token);
        if (!echoed || settingsDirection(Number(state.settings.settingsUpdatedAt) || 0, echoed) !== "none") continue;
      }
      if (fileId && fileId !== state.sync.settingsFileId) patchSync({ settingsFileId: fileId });
      return;
    }
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
  const generation = sessionGeneration;
  const session = await requestExtensionSession();
  if (!session || generation !== sessionGeneration || accountChanging) return false;
  // The extension's displayed profile may be cached from an older grant.
  // Verify the token itself before retaining account-specific Drive IDs.
  const account = await fetchAccount(session.token.accessToken);
  if (!account) throw new Error("Couldn't verify your Google account. Try signing in again.");
  if (generation !== sessionGeneration || accountChanging) return false;
  rememberAccount(account);
  sessionGeneration++;
  storeToken(session.token);
  // The extension's Letterboxd profile links here too, unless one is already
  // linked or was unlinked on this device.
  if (session.letterboxd && !state.settings.letterboxd && !state.settings.letterboxdUnlinked) {
    updateSettings({ letterboxd: session.letterboxd });
  }
  patchSync({
    connected: true,
    account,
    status: "idle",
    error: ""
  });
  return true;
}

async function runSync(retried = false) {
  if (!state.sync.connected || accountChanging) return;
  // An expired token is renewed from the extension when it can be, then from a long-lived grant,
  // so only someone with neither is asked to reconnect.
  let token = getStoredToken();
  if (!token) {
    try { token = await adoptExtensionSession() ? getStoredToken() : null; }
    catch (error) {
      patchSync({ status: "needs-auth", error: error instanceof Error ? error.message : "Couldn't verify the extension's account." });
      return;
    }
  }
  if (!token && LONG_SIGNIN_ENABLED) {
    const renewal = await renewAccess();
    if (renewal.ok) token = renewal.token;
    else if (renewal.reason === "offline") {
      patchSync({ status: "error", error: "Couldn't renew your sign-in just now. It will try again." });
      return;
    }
  }
  if (!token) {
    patchSync({ status: "needs-auth", error: "" });
    return;
  }

  const generation = sessionGeneration;
  const currentSession = () => !accountChanging && state.sync.connected && generation === sessionGeneration;

  patchSync({ status: "syncing", error: "", held: 0 });
  try {
    let fileId = state.sync.fileId || await findRemoteFileId(token.accessToken);
    let nextFileId = fileId;
    // Read, merge, and save only if Drive's copy is still the one read: when
    // another device saved in between, go round again with its copy.
    let settled = false;
    for (let attempt = 0; attempt < SYNC_CONFLICT_ATTEMPTS; attempt++) {
      const version = fileId ? await fileVersion(fileId, token.accessToken) : "";
      const remote = fileId ? await readRemote(fileId, token.accessToken) : { movies: [], deleted: [] };
      if (!currentSession()) return;
      if (fileId && await fileVersion(fileId, token.accessToken) !== version) continue;
      if (!currentSession()) return;
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
      if (!remoteChanged && fileId) { settled = true; break; }
      if (fileId && await fileVersion(fileId, token.accessToken) !== version) continue;
      if (!currentSession()) return;
      if (JSON.stringify(state.library) !== JSON.stringify(merged)) continue;
      nextFileId = await writeRemote(fileId, token.accessToken, merged);
      fileId = nextFileId;
      if (!currentSession()) return;
      // Verify the published copy and merge again if another device or a
      // local edit raced the upload. The preflight/upload pair is not atomic.
      const echoedVersion = await fileVersion(fileId, token.accessToken);
      const echoed = await readRemote(fileId, token.accessToken);
      if (await fileVersion(fileId, token.accessToken) !== echoedVersion) continue;
      if (!currentSession()) return;
      const latest = mergeWatchlists(state.library, echoed);
      if (JSON.stringify(latest) !== JSON.stringify(state.library)) setLibrary(latest);
      if (JSON.stringify(latest) !== JSON.stringify(echoed)) continue;
      settled = true;
      break;
    }
    if (!settled) throw new DriveError(SYNC_CONFLICT_MESSAGE, 409);
    if (!currentSession()) return;
    const account = state.sync.account?.email ? state.sync.account : await fetchAccount(token.accessToken);

    await syncSettings(token.accessToken);
    if (!currentSession()) return;
    patchSync({ fileId: nextFileId, account: account ?? state.sync.account, lastSyncAt: Date.now(), status: "idle", error: "" });
    syncedOnce = true;
    // Soon, not after the usual wait for a burst of edits: this is the moment the library is known to be whole.
    calendarMirror.schedule(300);
  } catch (error) {
    if (!currentSession()) return;
    if (error instanceof DriveError && error.status === 401) {
      forgetToken();
      // Google turned the token down before it ran out: with a grant, ask for another once before giving up.
      if (!retried && holdsGrant()) return runSync(true);
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
    // A long-lived sign-in asks for Calendar in the same window, so one grant keeps both alive.
    const token = await askGoogle({ consent: !state.sync.connected, calendar: wantCalendar });
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
  sessionGeneration++;
  accountChanging = false;
  const token = getStoredToken();
  // A token the extension lent is only dropped: revoking it would sign the
  // extension out too.
  if (token && token.source !== "extension") await revokeToken(token.accessToken);
  else forgetToken();
  // A long-lived grant is voided at Google and forgotten here, even when the access token had already run out.
  await revokeGrant();
  setExtensionSignInOff(true);
  // This device forgets the calendar; the calendar itself and the synced switch stay, so signing back in resumes.
  syncedOnce = false;
  calendarMirror.reset();
  // Ticket copies kept on this device for the cinema go with the sign-in; the files stay in Drive.
  await forgetAllTickets();
  patchSync({ connected: false, fileId: "", settingsFileId: "", account: null, lastSyncAt: 0, status: "local", error: "" });
}

export type TicketDetails = Pick<Booking, "showAt" | "cinema" | "screen" | "seats" | "bookingId" | "source">;

/** A live Drive token for ticket files: the stored one, or one renewed from a long-lived grant. */
async function driveToken(): Promise<string | null> {
  const token = getStoredToken();
  if (token) return token.accessToken;
  if (LONG_SIGNIN_ENABLED) {
    const renewal = await renewAccess();
    if (renewal.ok) return renewal.token.accessToken;
  }
  return null;
}

/**
 * Puts a ticket on a title. The details are saved at once; with `file`, a copy is kept on this device (for the
 * cinema, offline) and in the person's own Drive. `fileSaved` is false when Drive couldn't take the file
 * (sign-in paused, offline): the details and the device copy are still saved.
 */
export async function saveTicket(movieId: string, details: TicketDetails, file: File | null, keepFile: boolean): Promise<{ ok: true; fileSaved: boolean } | { ok: false; reason: string }> {
  const before = state.library.movies.find((movie) => movie.id === movieId)?.booking;
  const keptFile = keepFile && !file && before?.ticketFileId
    ? { ticketFileId: before.ticketFileId, ticketFileName: before.ticketFileName, ticketMime: before.ticketMime }
    : {};
  const first = setBooking(state.library, movieId, { ...details, ...keptFile });
  if (!first.ok) return first;
  commit(first.document);

  const dropFile = async (fileId: string | undefined) => {
    if (!fileId) return;
    const token = await driveToken();
    if (token) await deleteAppFile(token, fileId).catch(() => undefined);
  };
  if (!keepFile) {
    await forgetTicket(movieId);
    await dropFile(before?.ticketFileId);
    return { ok: true, fileSaved: false };
  }
  if (!file) return { ok: true, fileSaved: Boolean(keptFile.ticketFileId) };

  await cacheTicket(movieId, file);
  // Kept on this device either way; Drive gets it when it can be reached.
  const onDeviceOnly = () => {
    const local = setBooking(state.library, movieId, { ...details, ticketFileName: file.name, ticketMime: file.type || undefined });
    if (local.ok) commit(local.document);
    return { ok: true as const, fileSaved: false };
  };
  const token = await driveToken();
  if (!token) return onDeviceOnly();
  try {
    const extension = (/\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1] ?? (file.type.split("/")[1] || "bin")).toLowerCase();
    const fileId = await uploadAppFile(token, `flickcue-ticket-${Date.now()}.${extension}`, file);
    const second = setBooking(state.library, movieId, { ...details, ticketFileId: fileId, ticketFileName: file.name, ticketMime: file.type || undefined });
    if (second.ok) commit(second.document);
    if (before?.ticketFileId && before.ticketFileId !== fileId) await dropFile(before.ticketFileId);
    return { ok: true, fileSaved: true };
  } catch {
    return onDeviceOnly();
  }
}

/** Takes a ticket off a title: the details, the copy on this device and the file in Drive. */
export async function removeTicket(movieId: string): Promise<boolean> {
  const fileId = state.library.movies.find((movie) => movie.id === movieId)?.booking?.ticketFileId;
  const result = clearBooking(state.library, movieId);
  if (!result.ok) return false;
  commit(result.document);
  await forgetTicket(movieId);
  if (fileId) {
    const token = await driveToken();
    if (token) await deleteAppFile(token, fileId).catch(() => undefined);
  }
  return true;
}

/** The ticket file to show: the copy on this device, else the one in Drive (then kept here too). */
export async function loadTicketFile(movieId: string): Promise<Blob | null> {
  const cached = await cachedTicket(movieId);
  if (cached) return cached;
  const booking = state.library.movies.find((movie) => movie.id === movieId)?.booking;
  if (!booking?.ticketFileId) return null;
  const token = await driveToken();
  if (!token) return null;
  const blob = await downloadAppFile(token, booking.ticketFileId);
  const typed = booking.ticketMime && !blob.type ? new Blob([blob], { type: booking.ticketMime }) : blob;
  await cacheTicket(movieId, typed);
  return typed;
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
      .catch((error) => patchSync({ status: "local", error: error instanceof Error ? error.message : "Couldn't verify the extension's account." }));
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
      if (event.key === SYNC_KEY) sessionGeneration++;
      state = { ...initialState(false), calendar: state.calendar };
      applyRegionAndLanguage(state.settings);
      emit();
    }
  });
}
