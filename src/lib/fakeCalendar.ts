// An in-memory Google Calendar for tests: the few calls this app makes, with the behaviours that matter to it
// (an event id that has ever existed answers 409 on insert, a deleted event stays as "cancelled",
// and Google can be told to fail the next request).
export interface FakeEvent { status: "confirmed" | "cancelled"; body: Record<string, any> }
export interface FakeCalendar { summary: string; events: Map<string, FakeEvent> }

export function fakeGoogleCalendar() {
  const calendars = new Map<string, FakeCalendar>();
  const calls: { method: string; path: string; body?: any }[] = [];
  const failures: Response[] = [];
  const control = { listAllowed: true, deleteCalendarAllowed: true, nextId: 1 };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const error = (status: number, reason: string) => json({ error: { code: status, message: reason, errors: [{ reason }] } }, status);

  async function fetchImpl(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const path = decodeURIComponent(url.pathname.replace("/calendar/v3", ""));
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const failure = failures.shift();
    if (failure) return failure;

    if (method === "POST" && path === "/calendars") {
      const id = `cal${control.nextId++}@group.calendar.google.com`;
      calendars.set(id, { summary: body.summary, events: new Map() });
      return json({ id });
    }
    if (path === "/users/me/calendarList") {
      if (!control.listAllowed) return error(403, "insufficientPermissions");
      return json({ items: [...calendars].map(([id, calendar]) => ({ id, summary: calendar.summary })) });
    }
    const match = /^\/calendars\/([^/]+)(?:\/events(?:\/([^/]+))?)?$/.exec(path);
    if (!match) return error(404, "notFound");
    const calendar = calendars.get(match[1]);
    if (!calendar) return error(404, "notFound");
    const isEvents = path.includes("/events");
    const eventId = match[2];

    if (!isEvents) {
      if (method === "DELETE") {
        if (!control.deleteCalendarAllowed) return error(403, "forbidden");
        calendars.delete(match[1]);
        return new Response(null, { status: 204 });
      }
      return json({ id: match[1] });
    }
    if (method === "GET") return json({ items: [...calendar.events].map(([id, event]) => ({ id, status: event.status })) });
    if (method === "POST") {
      if (calendar.events.has(body.id)) return error(409, "duplicate");
      calendar.events.set(body.id, { status: "confirmed", body });
      return json({ id: body.id });
    }
    const event = eventId ? calendar.events.get(eventId) : undefined;
    if (!event) return error(404, "notFound");
    if (method === "PATCH") {
      calendar.events.set(eventId!, { status: body.status ?? event.status, body: { ...event.body, ...body } });
      return json({ id: eventId });
    }
    if (method === "DELETE") {
      if (event.status === "cancelled") return error(410, "deleted");
      event.status = "cancelled";
      return new Response(null, { status: 204 });
    }
    return error(400, "badRequest");
  }

  return {
    fetch: fetchImpl,
    calendars,
    calls,
    control,
    /** The next request fails with this. */
    failNext: (status: number, reason = "") => void failures.push(error(status, reason)),
    /** The person deletes an event in Google Calendar. */
    userDeletes(calendarId: string, eventId: string) { calendars.get(calendarId)!.events.get(eventId)!.status = "cancelled"; },
    /** The person drags an event to another time. */
    userMoves(calendarId: string, eventId: string) {
      const event = calendars.get(calendarId)!.events.get(eventId)!;
      event.body = { ...event.body, start: { dateTime: "2030-01-01T00:00:00.000Z" } };
    },
    /** The person deletes the whole calendar. */
    userDeletesCalendar: (calendarId: string) => void calendars.delete(calendarId),
    live(calendarId: string) {
      return [...(calendars.get(calendarId)?.events ?? [])].filter(([, event]) => event.status === "confirmed").map(([id]) => id);
    },
    reset() { calls.length = 0; }
  };
}
