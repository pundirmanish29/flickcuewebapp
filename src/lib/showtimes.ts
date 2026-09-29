// Cinema showtimes from FlickCue's title service (its /showtimes routes, which
// hold the MovieGlu credentials). Until those are set up the service says so,
// and the app keeps to plain links (src/lib/cinemas.ts).

import { PROXY_BASE_URL } from "./config";

export interface ShowtimeStatus {
  configured: boolean;
  territory: string;
}

export interface CinemaShowings {
  id: number;
  name: string;
  distanceKm: number | null;
  showings: { format: string; filmId: number; times: string[] }[];
}

export interface FilmShowtimes {
  film: { id: number; name: string } | null;
  cinemas: CinemaShowings[];
}

let status: Promise<ShowtimeStatus> | null = null;

/** Whether in-app showtimes are available, and for which country; asked once per visit. */
export function showtimeStatus(): Promise<ShowtimeStatus> {
  status ??= fetch(`${PROXY_BASE_URL}/showtimes/status`)
    .then((response) => (response.ok ? response.json() : { configured: false, territory: "" }))
    .then((data) => ({ configured: data?.configured === true, territory: String(data?.territory ?? "").toUpperCase() }))
    .catch(() => {
      status = null;
      return { configured: false, territory: "" };
    });
  return status;
}

async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE_URL}${path}`);
  } catch {
    throw new Error("Couldn't reach FlickCue's title service. Check your connection.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 429) throw new Error("Too many showtime lookups right now. Try again in a minute.");
  if (!response.ok) throw new Error(data?.error || "Couldn't load showtimes. Try again in a moment.");
  return data as T;
}

export function fetchShowtimes(query: { imdb?: string; title: string; date: string; lat: number; lng: number }): Promise<FilmShowtimes> {
  const params = new URLSearchParams({ title: query.title, date: query.date, lat: String(query.lat), lng: String(query.lng) });
  if (query.imdb) params.set("imdb", query.imdb);
  return get<FilmShowtimes>(`/showtimes/film?${params}`);
}

export async function bookingUrl(show: { film: number; cinema: number; date: string; time: string }): Promise<string> {
  const params = new URLSearchParams({ film: String(show.film), cinema: String(show.cinema), date: show.date, time: show.time });
  const { url } = await get<{ url: string }>(`/showtimes/book?${params}`);
  if (!/^https?:\/\//i.test(url)) throw new Error("No booking link for that show.");
  return url;
}

/** The next seven days as local ISO dates, with labels: Today, Tomorrow, then weekdays. */
export function showtimeDays(now = Date.now()): { date: string; label: string }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() + index);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const label = index === 0 ? "Today" : index === 1 ? "Tomorrow" : `${day.toLocaleDateString(undefined, { weekday: "short" })} ${day.getDate()}`;
    return { date, label };
  });
}
