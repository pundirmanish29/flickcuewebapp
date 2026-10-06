import { useEffect, useState } from "react";
import { showtimeLinks } from "../lib/cinemas";
import { bookingUrl, fetchShowtimes, showtimeDays, showtimeStatus, type FilmShowtimes, type ShowtimeStatus } from "../lib/showtimes";
import { useAppState } from "../lib/store";
import { useWhere } from "../lib/useCinemas";
import { toast } from "./Toast";

/**
 * Where to see a film's showtimes: Google for the reader's city (or region),
 * plus the city's page on BookMyShow and District when the city is known.
 */
export function ShowtimeLinks({ title, year, lead }: { title: string; year?: string; lead?: string }) {
  const { city, regionLabel } = useWhere();
  const links = showtimeLinks(title, year || "", city, regionLabel);
  return (
    <>
      {lead && <p className="showtime-hint">{lead}</p>}
      <div className="showtime-links">
        {links.map((link) => (
          <a key={link.label} className="link-chip" href={link.url} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </div>
      {!city && (
        <p className="showtime-hint">
          Showtimes for {regionLabel}. <a href="#/settings">Set your city</a> to see what's on near you.
        </p>
      )}
    </>
  );
}

type Load = { state: "loading" } | { state: "done"; data: FilmShowtimes } | { state: "error"; message: string };

/** Opens the cinema's booking page for one show, in a tab opened within the tap so it isn't blocked. */
function book(show: { film: number; cinema: number; date: string; time: string }) {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  bookingUrl(show)
    .then((url) => {
      if (tab) tab.location.href = url;
      else window.location.href = url;
    })
    .catch((error: Error) => {
      tab?.close();
      toast(error.message);
    });
}

/**
 * Real showtimes for a film in the reader's city, nearest cinema first, when
 * FlickCue's showtimes service is set up for their country; otherwise, and
 * for a typed city with no coordinates, the plain links.
 */
export function FilmShowtimes({ title, year, imdb }: { title: string; year?: string; imdb?: string }) {
  const { settings } = useAppState();
  const { city, place } = useWhere();
  const [status, setStatus] = useState<ShowtimeStatus | null>(null);
  const days = showtimeDays();
  const [date, setDate] = useState(days[0].date);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let live = true;
    void showtimeStatus().then((found) => live && setStatus(found));
    return () => {
      live = false;
    };
  }, []);

  const region = (settings.region || "IN").toUpperCase();
  // "XX" is MovieGlu's sandbox, which serves test data anywhere.
  const usable = Boolean(status?.configured && city?.lat != null && city.lng != null && (status.territory === region || status.territory === "XX"));
  const name = title.replace(/\s*\(\d{4}\)$/, "");

  useEffect(() => {
    if (!usable || !city?.lat || !city.lng) return;
    let live = true;
    setLoad({ state: "loading" });
    fetchShowtimes({ imdb, title: name, date, lat: city.lat, lng: city.lng })
      .then((data) => live && setLoad({ state: "done", data }))
      .catch((error: Error) => live && setLoad({ state: "error", message: error.message }));
    return () => {
      live = false;
    };
  }, [usable, date, imdb, name, city?.lat, city?.lng]);

  if (!usable) return <ShowtimeLinks title={title} year={year} />;

  const dayLabel = days.find((day) => day.date === date)?.label.toLowerCase() ?? "that day";
  return (
    <div className="showtimes">
      <div className="showtime-days" role="group" aria-label="Day">
        {days.map((day) => (
          <button key={day.date} type="button" className="day-chip" aria-pressed={day.date === date} onClick={() => setDate(day.date)}>
            {day.label}
          </button>
        ))}
      </div>

      {load.state === "loading" && <p className="showtime-hint" role="status">Finding shows near {place}…</p>}
      {load.state === "error" && <p className="showtime-hint">{load.message}</p>}
      {load.state === "done" && !load.data.film && <p className="showtime-hint">No showtimes listed for this film in {place} yet.</p>}
      {load.state === "done" && load.data.film && !load.data.cinemas.length && (
        <p className="showtime-hint">No shows {dayLabel} near {place}. Try another day.</p>
      )}

      {load.state === "done" && load.data.cinemas.length > 0 && (
        <ul className="cinema-list">
          {load.data.cinemas.map((cinema) => (
            <li key={cinema.id} className="cinema">
              <p className="cinema-name">
                <b>{cinema.name}</b>
                {cinema.distanceKm != null && <span>{cinema.distanceKm} km</span>}
              </p>
              {cinema.showings.map((showing) => (
                <div key={showing.format} className="cinema-format">
                  {(cinema.showings.length > 1 || showing.format !== "Standard") && <span className="format-label">{showing.format}</span>}
                  <div className="cinema-times">
                    {showing.times.map((time) => (
                      <button
                        key={time}
                        type="button"
                        className="time-chip"
                        aria-label={`Book ${time}, ${showing.format}, at ${cinema.name}`}
                        onClick={() => book({ film: showing.filmId || load.data.film!.id, cinema: cinema.id, date, time })}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <div className="showtime-more">
        <ShowtimeLinks title={title} year={year} lead="Also on" />
      </div>
    </div>
  );
}
