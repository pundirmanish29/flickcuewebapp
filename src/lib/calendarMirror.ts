// Keeps the FlickCue calendar in Google Calendar in step with the library's
// reminders. It owns when to run and what to do about each kind of failure; the
// store hands it what it needs (library, settings, tokens) so it never imports
// the store, and tests can drive it with a fake calendar.
//
// It reconciles rather than reacting to edits: it compares what the library
// calls for (calendarPlan.ts) with what the calendar holds, so a reminder
// changed by the extension or the Android app, an import, a restore or an undo
// is picked up the same way as one set here.

import { applyOps, classifyError, deleteCalendar, deleteEvent, ensureCalendar, listEvents, type ErrorKind } from "./calendar";
import { desiredEvents, parseEventId, planCalendar } from "./calendarPlan";
import type { StoredToken } from "./auth";
import type { LibraryDocument } from "./types";

export type CalendarStatus = "off" | "needs-permission" | "pending" | "syncing" | "ok" | "held" | "error";

export interface CalendarState {
  status: CalendarStatus;
  /** Plain-language words for the status, "" when there is nothing to say. */
  message: string;
  /** Deletes held back because there were too many to be believable. */
  held: number;
  /** Ids of the events known to be on the calendar, so a title can show it is there. */
  mirrored: string[];
  /** Calendar was left unticked at Google's consent screen; ask again only when the person taps. */
  declined: boolean;
}

export interface PersistedCalendar {
  account: string;
  calendarId: string;
  mirrored: string[];
  /** Events this device deleted itself (capped): wanted again at the same minute, they are brought back. */
  deletedByUs: string[];
  /** The wanted events at the last full run; unchanged and recent means nothing to list. */
  fingerprint: string;
  lastRunAt: number;
  declined: boolean;
}

export interface MirrorDeps {
  getLibrary(): LibraryDocument;
  getSettings(): { calendarMirror: boolean; calendarId: string };
  setSettings(patch: { calendarMirror?: boolean; calendarId?: string }): void;
  /** At least one Drive sync has succeeded in this page session, and none is being held. */
  syncReady(): boolean;
  /** The signed-in Google account, so another account never reuses this one's calendar. */
  account(): string;
  /** A live token that may use Calendar, or null. */
  getToken(): StoredToken | null;
  dropToken(): void;
  load(): PersistedCalendar | null;
  save(value: PersistedCalendar | null): void;
  onState(state: CalendarState): void;
  now(): number;
  timeZone(): string;
  /** Milliseconds between writes to Google (default 250); tests use 0. */
  gap?: number;
}

const DEBOUNCE = 5_000;
const RETRY = 60_000;
const NEXT_BATCH = 2_000;
const FRESH = 30 * 60_000;
const MAX_DELETED_BY_US = 200;
const MAX_PASSES = 3;

const WORDS = {
  needsPermission: "FlickCue needs your permission to use Google Calendar.",
  declined: "Google Calendar wasn't allowed, so nothing was added. You can allow it and try again.",
  pending: "Reconnect Google Calendar to keep it up to date. Events already on it still go off on time.",
  rate: "Google Calendar is busy. FlickCue will try again shortly.",
  apiOff: "Google Calendar isn't switched on for FlickCue yet.",
  network: "Couldn't reach Google Calendar. FlickCue will try again."
};

const IDLE: CalendarState = { status: "off", message: "", held: 0, mirrored: [], declined: false };

/** A short fingerprint of what is wanted, to tell "nothing changed" without listing the calendar. */
function fingerprintOf(calendarId: string, ids: string[]): string {
  let hash = 0;
  for (const char of `${calendarId}|${[...ids].sort().join(",")}`) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return `${ids.length}:${hash >>> 0}`;
}

async function withLock<T>(task: () => Promise<T>): Promise<T | undefined> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks) return task();
  // One tab at a time; a tab that finds another already running leaves it to that one.
  return locks.request("flickcue-calendar", { ifAvailable: true }, (lock) => (lock ? task() : undefined)) as Promise<T | undefined>;
}

export function createCalendarMirror(deps: MirrorDeps) {
  let state: CalendarState = { ...IDLE };
  let running: Promise<void> | null = null;
  let dirty = false;
  let allowBulk = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const publish = (patch: Partial<CalendarState>) => {
    state = { ...state, ...patch };
    deps.onState(state);
  };

  /** What this device remembers, only if it belongs to the signed-in account. */
  function saved(): PersistedCalendar | null {
    const value = deps.load();
    return value && value.account === deps.account() ? value : null;
  }

  function remember(patch: Partial<PersistedCalendar>) {
    const base = saved() ?? { account: deps.account(), calendarId: "", mirrored: [], deletedByUs: [], fingerprint: "", lastRunAt: 0, declined: false };
    deps.save({ ...base, ...patch });
  }

  /** Brings the state back from storage on load. */
  function restore() {
    const settings = deps.getSettings();
    const value = saved();
    state = settings.calendarMirror
      ? { status: "pending", message: "", held: 0, mirrored: value?.mirrored ?? [], declined: Boolean(value?.declined) }
      : { ...IDLE };
    deps.onState(state);
  }

  async function once(): Promise<void> {
    const settings = deps.getSettings();
    if (!settings.calendarMirror) {
      if (state.status !== "off") publish({ ...IDLE });
      return;
    }
    // Never reconcile against a library that might be partial: before the first sync of this visit, or while one is held.
    if (!deps.syncReady()) return;

    const token = deps.getToken();
    const memory = saved();
    if (!token) {
      const declined = Boolean(memory?.declined);
      publish({ status: declined ? "needs-permission" : "pending", message: declined ? WORDS.declined : WORDS.pending, declined });
      return;
    }

    const now = deps.now();
    const library = deps.getLibrary();
    const desired = desiredEvents(library, now);
    const wasHeld = allowBulk;
    // The calendar's id as this device knows it, and as the synced settings do; either may turn out to be stale.
    let localId = memory?.calendarId ?? "";
    let syncedId = settings.calendarId;
    let calendarId = localId || syncedId;

    // Nothing wanted has changed and the last full look was recent: nothing to ask Google.
    const fingerprint = (id: string) => fingerprintOf(id, desired.map((event) => event.id));
    if (calendarId && memory && memory.fingerprint === fingerprint(calendarId) && now - memory.lastRunAt < FRESH && !wasHeld) {
      if (state.status !== "ok") publish({ status: "ok", message: "", held: 0 });
      return;
    }

    publish({ status: "syncing", message: "" });
    let recreated = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const found = await ensureCalendar(token.accessToken, [localId, syncedId]);
        calendarId = found.id;
        if (calendarId !== deps.getSettings().calendarId) deps.setSettings({ calendarId });

        const existing = await listEvents(token.accessToken, calendarId, now);
        const plan = planCalendar(desired, existing, { allowBulkDelete: wasHeld, deletedByUs: new Set(memory?.deletedByUs ?? []) }, now);
        allowBulk = false;
        let done = { created: [] as string[], deleted: [] as string[], revived: [] as string[] };
        try {
          done = await applyOps(token.accessToken, calendarId, plan.ops, deps.timeZone(), deps.gap);
        } catch (error) {
          done = (error as { done?: typeof done }).done ?? done;
          throw error;
        } finally {
          const gone = new Set(done.deleted);
          const kept = existing.filter((event) => event.status !== "cancelled" && parseEventId(event.id) && !gone.has(event.id)).map((event) => event.id);
          const mirrored = [...new Set([...kept, ...done.created, ...done.revived])];
          const deletedByUs = [...(saved()?.deletedByUs ?? []).filter((id) => !done.revived.includes(id)), ...done.deleted].slice(-MAX_DELETED_BY_US);
          remember({ calendarId, mirrored, deletedByUs });
          publish({ mirrored });
        }
        const complete = !plan.held && plan.remaining === 0;
        remember({ calendarId, fingerprint: complete ? fingerprint(calendarId) : "", lastRunAt: now, declined: false });
        publish(plan.held
          ? { status: "held", held: plan.deletes, message: `${plan.deletes} events would be removed from your calendar. That's more than usual, so FlickCue is waiting for you to confirm.`, declined: false }
          : { status: "ok", held: 0, message: "", declined: false });
        if (plan.remaining > 0) schedule(NEXT_BATCH);
        return;
      } catch (error) {
        const kind: ErrorKind = classifyError(error);
        if (kind === "missing" && !recreated) {
          // The calendar was deleted outside FlickCue: make it again, once.
          recreated = true;
          calendarId = localId = syncedId = "";
          deps.setSettings({ calendarId: "" });
          remember({ calendarId: "", mirrored: [], fingerprint: "" });
          continue;
        }
        handleError(kind, error);
        return;
      }
    }
  }

  function handleError(kind: ErrorKind, error: unknown) {
    if (kind === "auth") {
      deps.dropToken();
      publish({ status: "pending", message: WORDS.pending });
    } else if (kind === "permission") {
      remember({ declined: true });
      publish({ status: "needs-permission", message: WORDS.needsPermission, declined: true });
    } else if (kind === "api-disabled") {
      publish({ status: "error", message: WORDS.apiOff });
    } else if (kind === "rate") {
      publish({ status: "error", message: WORDS.rate });
      schedule(RETRY);
    } else if (kind === "network") {
      publish({ status: "error", message: WORDS.network });
      schedule(RETRY);
    } else {
      publish({ status: "error", message: error instanceof Error ? error.message : "Google Calendar didn't accept that." });
    }
  }

  /** One run at a time. Asking while one is going runs it again afterwards (up to a few passes). */
  function run(options: { allowBulkDelete?: boolean } = {}): Promise<void> {
    if (options.allowBulkDelete) allowBulk = true;
    if (running) {
      dirty = true;
      return running;
    }
    running = (async () => {
      try {
        for (let pass = 0; pass < MAX_PASSES; pass++) {
          dirty = false;
          await withLock(once);
          if (!dirty) break;
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** After a change: soon, and once for a burst of changes. A no-op while the feature is off. */
  function schedule(delay = DEBOUNCE) {
    if (!deps.getSettings().calendarMirror) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void run(), delay);
  }

  /** The person gave permission: make the calendar and fill it. */
  async function started(): Promise<void> {
    remember({ declined: false });
    publish({ declined: false });
    await run();
  }

  /** The person left Calendar unticked at Google's consent screen. */
  function declined() {
    remember({ declined: true });
    publish({ status: "needs-permission", message: WORDS.declined, declined: true });
  }

  /**
   * Switches the mirror off and deletes the FlickCue calendar. Needs a live token to delete it: without one the
   * mirror is switched off and the calendar is left (`removed` is false). Where deleting the calendar is not
   * allowed, the events this app made are deleted instead.
   */
  async function stop(): Promise<{ removed: boolean }> {
    clearTimeout(debounce);
    const token = deps.getToken();
    const calendarId = saved()?.calendarId || deps.getSettings().calendarId;
    let removed = false;
    if (token && calendarId) {
      try {
        await deleteCalendar(token.accessToken, calendarId);
        removed = true;
      } catch (error) {
        if (classifyError(error) === "permission") {
          try {
            const events = await listEvents(token.accessToken, calendarId, 0);
            for (const event of events) if (event.status !== "cancelled" && parseEventId(event.id)) await deleteEvent(token.accessToken, calendarId, event.id);
            removed = true;
          } catch {
            // Left as it is; the switch still goes off.
          }
        }
      }
    }
    deps.setSettings({ calendarMirror: false, calendarId: "" });
    deps.save(null);
    publish({ ...IDLE });
    return { removed };
  }

  /** A message for the person without changing where things stand (a closed Google window, say). */
  function notice(message: string) {
    publish({ message });
  }

  /** Signing out: this device forgets the calendar. The calendar itself and the synced switch are left. */
  function reset() {
    clearTimeout(debounce);
    deps.save(null);
    publish({ ...IDLE, status: deps.getSettings().calendarMirror ? "pending" : "off" });
  }

  return { run, schedule, started, declined, notice, stop, reset, restore, getState: () => state };
}

export type CalendarMirror = ReturnType<typeof createCalendarMirror>;
