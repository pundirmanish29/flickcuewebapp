import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { TitleCard } from "../components/TitleCard";
import * as actions from "../lib/actions";
import {
  displayTitle, formatReminder, formatRuntime, hasActiveReminder, isDueNow, isUnreleased, matchesKind, matchesSearch, sortMovies
} from "../lib/rules";
import { connect, useAppState } from "../lib/store";
import { upscale } from "../lib/tmdb";
import type { KindFilter, Movie, SortMode } from "../lib/types";

const SORT_LABELS: Record<SortMode, string> = {
  added: "Recently added",
  reminder: "Reminder soonest",
  title: "Title A–Z",
  rating: "Best reviewed",
  shortest: "Shortest first"
};

/** Tonight's pick: whatever is due, else the best-reviewed released title, else anything. */
function pickTonight(queue: Movie[], skip: number): Movie | undefined {
  const released = queue.filter((movie) => !isUnreleased(movie));
  const due = sortMovies(released.filter((movie) => isDueNow(movie)), "reminder");
  const rest = sortMovies(released.filter((movie) => !isDueNow(movie)), "rating");
  const order = [...due, ...rest];
  return order.length ? order[skip % order.length] : undefined;
}

export function QueuePage({ onOpen, query, onNavigate }: { onOpen: (id: string) => void; query: string; onNavigate: (route: string) => void }) {
  const { library, sync } = useAppState();
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortMode>(() => (localStorage.getItem("flickcue.sort") as SortMode) || "added");
  const [skip, setSkip] = useState(0);

  const queue = useMemo(() => library.movies.filter((movie) => !movie.watched), [library.movies]);
  const dueToday = queue.filter((movie) => isDueNow(movie)).length;
  const tonight = pickTonight(queue, skip);

  const radar = useMemo(() => {
    const now = Date.now();
    return queue
      .map((movie) => ({
        movie,
        at: hasActiveReminder(movie, now) ? Number(movie.remindAt)
          : isUnreleased(movie, now) && /^\d{4}-\d{2}-\d{2}$/.test(movie.releaseDate || "") ? new Date(`${movie.releaseDate}T20:00:00`).getTime() : 0
      }))
      .filter((entry) => entry.at > now && entry.movie.id !== tonight?.id)
      .sort((a, b) => a.at - b.at)
      .slice(0, 8);
  }, [queue, tonight?.id]);

  const visible = sortMovies(queue.filter((movie) => matchesKind(movie, kind) && matchesSearch(movie, query)), sort);

  const changeSort = (mode: SortMode) => {
    setSort(mode);
    try {
      localStorage.setItem("flickcue.sort", mode);
    } catch {
      // Remembering the sort is a convenience only.
    }
  };

  return (
    <>
      <section className="intro paper">
        <div className="wrap">
          <p className="eyebrow">
            Your FlickCue library · {library.movies.length} saved{dueToday ? ` · ${dueToday} due today` : ""}
          </p>
          <h1 className="display">
            Everything worth watching.
            <em>Saved for the right night.</em>
          </h1>
          {library.movies.length === 0 ? (
            <div className="empty-intro">
              <p className="lede">
                Films and shows you save from the FlickCue extension, the Android app or right here, with your reminders and notes, in one place.
              </p>
              <div className="button-row">
                {!sync.connected && (
                  <button type="button" className="button button-ink large" onClick={() => void connect()}>
                    Sign in with Google to bring your list
                  </button>
                )}
                <button type="button" className="button button-quiet large" onClick={() => onNavigate("discover")}>
                  <Icon name="compass" size={16} /> Find something to watch
                </button>
              </div>
            </div>
          ) : (
            <p className="lede">
              {queue.length} in your queue, {library.movies.length - queue.length} watched.
              {sync.connected ? " Synced with your extension and phone through Google Drive." : " Sign in to sync with the extension and the Android app."}
            </p>
          )}
        </div>
      </section>

      {tonight && (
        <section className="band tonight">
          <div className="wrap tonight-grid">
            <div className="tonight-art" style={tonight.backdrop ? { backgroundImage: `url(${upscale(tonight.backdrop, "w1280")})` } : undefined}>
              <Poster src={upscale(tonight.poster, "w342")} title={tonight.title} className="tonight-poster" />
            </div>
            <div className="tonight-text">
              <p className="eyebrow on-dark">
                {!isDueNow(tonight) ? "Tonight's pick" : Number(tonight.remindAt) <= Date.now() ? "Due now" : `Due ${formatReminder(Number(tonight.remindAt))}`}
              </p>
              <h2>{displayTitle(tonight)}</h2>
              <p className="on-dark-muted">
                {[tonight.mediaType, tonight.year, formatRuntime(tonight.runtimeMinutes), tonight.rating ? `★ ${tonight.rating}` : ""].filter(Boolean).join(" · ")}
              </p>
              {tonight.tagline && <p className="tonight-tagline">{tonight.tagline}</p>}
              <div className="button-row">
                <button type="button" className="button button-lime" onClick={() => actions.toggleWatched(tonight.id)}>
                  <Icon name="eye" size={16} /> Watched it
                </button>
                <button type="button" className="button button-outline-light" onClick={() => onOpen(tonight.id)}>Details</button>
                {isDueNow(tonight) && (
                  <button type="button" className="button button-outline-light" onClick={() => actions.snooze(tonight.id)}>
                    <Icon name="clock" size={16} /> Snooze a day
                  </button>
                )}
                {queue.length > 1 && (
                  <button type="button" className="button button-outline-light" onClick={() => setSkip((value) => value + 1)}>
                    <Icon name="shuffle" size={16} /> Another
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {radar.length > 0 && (
        <section className="paper radar">
          <div className="wrap">
            <h2 className="section-title">On your radar</h2>
            <ul className="radar-list">
              {radar.map(({ movie, at }) => (
                <li key={movie.id}>
                  <button type="button" className="radar-item" onClick={() => onOpen(movie.id)}>
                    <Poster src={movie.poster} title={movie.title} className="radar-poster" />
                    <span className="radar-text">
                      <span className="radar-when">{hasActiveReminder(movie) ? formatReminder(at) : `Out ${new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</span>
                      <span className="radar-title">{displayTitle(movie)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="paper titles" id="titles">
        <div className="wrap">
          <div className="toolbar">
            <h2 className="section-title">Queue <span className="count">{visible.length}</span></h2>
            <div className="toolbar-controls">
              <div className="segmented" role="group" aria-label="Show">
                {(["all", "movie", "tv"] as KindFilter[]).map((value) => (
                  <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                    {value === "all" ? "All" : value === "movie" ? "Films" : "Shows"}
                  </button>
                ))}
              </div>
              <label className="select">
                <span className="visually-hidden">Sort</span>
                <select value={sort} onChange={(event) => changeSort(event.target.value as SortMode)}>
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => <option key={mode} value={mode}>{SORT_LABELS[mode]}</option>)}
                </select>
              </label>
            </div>
          </div>

          {visible.length ? (
            <div className="grid">
              {visible.map((movie) => <TitleCard key={movie.id} movie={movie} onOpen={onOpen} />)}
            </div>
          ) : (
            <p className="empty">
              {query ? `Nothing in your queue matches “${query}”.` : queue.length ? "Nothing matches this filter." : "Your queue is empty. Find something in Discover."}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
