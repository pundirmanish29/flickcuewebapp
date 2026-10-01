// Google Calendar, for the "FlickCue" calendar this app makes for reminders.
// The one permission asked for (calendar.app.created) reaches only calendars
// this app created: nothing else in the person's calendars can be read or changed.
// Shaped like drive.ts: a timeout on every request and a typed error that
// carries the HTTP status, so a stalled connection ends and a caller can tell
// "sign in again" from "slow down" from "gone".

import type { CalendarOp, ExistingEvent } from "./calendarPlan";
import { eventBody } from "./calendarPlan";

const API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_NAME = "FlickCue";
export const CALENDAR_TIMEOUT = 30_000;
const DAY = 86_400_000;

export class CalendarError extends Error {
  constructor(message: string, readonly status: number, readonly reason = "") {
    super(message);
  }
}

async function calendarFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALENDAR_TIMEOUT);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) }
    });
  } catch (error) {
    if (controller.signal.aborted) throw new CalendarError("Google Calendar took too long to answer. Check your connection and try again.", 0);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let reason = "";
    let message = "";
    try {
      const data = JSON.parse(text);
      reason = String(data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? "");
      message = String(data?.error?.message ?? "");
    } catch {
      message = text.slice(0, 200);
    }
    throw new CalendarError(`Calendar request failed (${response.status}). ${message}`.trim(), response.status, reason);
  }
  return response;
}

export type ErrorKind = "auth" | "permission" | "rate" | "api-disabled" | "missing" | "network" | "other";

/** What a failed call means for the mirror: sign in again, ask for permission, slow down, or just try later. */
export function classifyError(error: unknown): ErrorKind {
  if (!(error instanceof CalendarError)) return "network";
  const { status, reason } = error;
  if (status === 401) return "auth";
  if (status === 429 || /ratelimit|quota|dailylimit/i.test(reason)) return "rate";
  if (status === 403 && reason === "accessNotConfigured") return "api-disabled";
  if (status === 403) return "permission";
  if (status === 404 || status === 410) return "missing";
  if (status === 0 || status >= 500) return "network";
  return "other";
}

/**
 * The FlickCue calendar: the first of the ids we already know that still exists, else one found by name
 * (when the permission allows listing), else a new one. `created` says whether it was just made.
 */
export async function ensureCalendar(token: string, knownIds: string[]): Promise<{ id: string; created: boolean }> {
  for (const id of knownIds) {
    if (!id) continue;
    try {
      await calendarFetch(`${API}/calendars/${encodeURIComponent(id)}?fields=id`, token);
      return { id, created: false };
    } catch (error) {
      if (classifyError(error) !== "missing") throw error;
    }
  }
  try {
    const response = await calendarFetch(`${API}/users/me/calendarList?minAccessRole=owner&fields=items(id,summary)`, token);
    const found = ((await response.json()).items ?? []).find((item: { id?: string; summary?: string }) => item.summary === CALENDAR_NAME && item.id);
    if (found) return { id: String(found.id), created: false };
  } catch (error) {
    // Listing may not be allowed for an app that only sees calendars it made: then it makes one.
    if (!["permission", "missing"].includes(classifyError(error))) throw error;
  }
  const response = await calendarFetch(`${API}/calendars`, token, {
    method: "POST",
    body: JSON.stringify({ summary: CALENDAR_NAME, description: "Reminders from FlickCue. Safe to hide; FlickCue keeps it up to date." })
  });
  return { id: String((await response.json()).id), created: true };
}

/** The events on the calendar from yesterday on, including ones the person deleted (which stay as "cancelled"). */
export async function listEvents(token: string, calendarId: string, now: number): Promise<ExistingEvent[]> {
  const events: ExistingEvent[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "true",
      singleEvents: "true",
      timeMin: new Date(now - DAY).toISOString(),
      fields: "nextPageToken,items(id,status)",
      ...(pageToken ? { pageToken } : {})
    });
    const data = await (await calendarFetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${query}`, token)).json();
    for (const item of data.items ?? []) {
      if (typeof item?.id === "string") events.push({ id: item.id, status: item.status === "cancelled" ? "cancelled" : item.status === "tentative" ? "tentative" : "confirmed" });
    }
    pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
  } while (pageToken);
  return events;
}

/** "exists" when Google already has that id (a 409): it was made before, or the person deleted it. */
export async function insertEvent(token: string, calendarId: string, body: Record<string, unknown>): Promise<"created" | "exists"> {
  try {
    await calendarFetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none&fields=id`, token, { method: "POST", body: JSON.stringify(body) });
    return "created";
  } catch (error) {
    if (error instanceof CalendarError && error.status === 409) return "exists";
    throw error;
  }
}

/** Brings back an event this app deleted itself; if Google no longer has it, it is made again. */
export async function reviveEvent(token: string, calendarId: string, body: Record<string, unknown>): Promise<void> {
  const { id, ...fields } = body;
  try {
    await calendarFetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(String(id))}?sendUpdates=none&fields=id`, token, {
      method: "PATCH",
      body: JSON.stringify({ ...fields, status: "confirmed" })
    });
  } catch (error) {
    if (classifyError(error) !== "missing") throw error;
    await insertEvent(token, calendarId, body);
  }
}

/** Gone already counts as deleted. */
export async function deleteEvent(token: string, calendarId: string, id: string): Promise<void> {
  try {
    await calendarFetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=none`, token, { method: "DELETE" });
  } catch (error) {
    if (classifyError(error) !== "missing") throw error;
  }
}

export async function deleteCalendar(token: string, calendarId: string): Promise<void> {
  try {
    await calendarFetch(`${API}/calendars/${encodeURIComponent(calendarId)}`, token, { method: "DELETE" });
  } catch (error) {
    if (classifyError(error) !== "missing") throw error;
  }
}

const GAP = 250;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Carries out a plan one operation at a time, a little apart (Calendar limits how fast events are written).
 * Returns what was done; stops at the first error, which is thrown with the work so far in `done`.
 */
export async function applyOps(
  token: string, calendarId: string, ops: CalendarOp[], timeZone: string, gap = GAP
): Promise<{ created: string[]; deleted: string[]; revived: string[] }> {
  const done = { created: [] as string[], deleted: [] as string[], revived: [] as string[] };
  for (const [index, op] of ops.entries()) {
    if (index > 0 && gap > 0) await pause(gap);
    try {
      if (op.type === "delete") {
        await deleteEvent(token, calendarId, op.id);
        done.deleted.push(op.id);
      } else if (op.type === "revive") {
        await reviveEvent(token, calendarId, eventBody(op.event, timeZone));
        done.revived.push(op.event.id);
      } else {
        await insertEvent(token, calendarId, eventBody(op.event, timeZone));
        done.created.push(op.event.id);
      }
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { done });
    }
  }
  return done;
}
