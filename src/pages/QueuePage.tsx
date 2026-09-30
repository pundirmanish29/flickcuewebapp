import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { Landing } from "../components/Landing";
import { TitleCard } from "../components/TitleCard";
import { TonightStrip } from "../components/TonightStrip";
import { airingToday, readDismissed } from "../lib/newEpisode";
import * as actions from "../lib/actions";
import {
  cardLine, displayTitle, formatRating, getShowStatus, isShow, shortDay, seasonProgress, watchingShows, formatReminder, formatRuntime, hasActiveReminder, isDueNow, isUnreleased, matchesKind, matchesSearch, sortMovies
} from "../lib/rules";
import { updateSettings, useAppState } from "../lib/store";
import { PageHeader } from "../components/PageHeader";
import { fetchDetails, upscale } from "../lib/tmdb";
import { safeImage } from "../lib/safe";
import { pop } from "../lib/motion";
import { useShowScheduleRefresh } from "../lib/showSync";
import type { KindFilter, Movie, SortMode } from "../lib/types";

/**
 * The tonight panel's backdrop: a phone-sized copy on small screens, kept hidden
 * behind a shimmer until it has fully loaded, so it never paints in strips.
 */
function Backdrop({ src }: { src: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  if (state === "failed") return null;
  return (
    <>
      {state === "loading" && <span className="tonight-shimmer" aria-hidden="true" />}
      <img
        className={`tonight-backdrop ${state === "ready" ? "ready" : ""}`}
        src={upscale(src, "w1280")}
        srcSet={`${upscale(src, "w780")} 780w, ${upscale(src, "w1280")} 1280w`}
        // Phones take the 780 copy even at 3x: plenty sharp under the panel's gradient, a third the download.
        sizes="(max-width: 600px) 260px, (max-width: 900px) 100vw, 60vw"
        alt=""
        decoding="async"
        fetchPriority="high"
        onLoad={() => setState("ready")}
        onError={() => setState("failed")}
      />
    </>
  );
}

function readLegacySort(): SortMode | "" {
  try {
    return (localStorage.getItem("flickcue.sort") as SortMode) || "";
  } catch {
    return "";
  }
}

const SORT_LABELS: Record<SortMode, string> = {
  added: "Recently added",
  reminder: "Reminder soonest",
  title: "Title A–Z",
  rating: "Best reviewed",
  shortest: "Shortest first"
};

/** Tonight's pick: whatever is due, else the best-reviewed released title, else anything. */
function pickTonight(queue: Movie[], skip: number): { movie?: Movie; place: number; due: Movie[] } {
  const released = queue.filter((movie) => !isUnreleased(movie));
  const due = sortMovies(released.filter((movie) => isDueNow(movie)), "reminder");
  const rest = sortMovies(released.filter((movie) => !isDueNow(movie)), "rating");
  const order = [...due, ...rest];
  const index = order.length ? skip % order.length : 0;
  return { movie: order[index], place: index + 1, due };
}

type QueueFilter = KindFilter | "airing";
const PAGE = 30;

/** A show that's on air now: new episodes coming, or one you're partway through. */
const isAiring = (movie: Movie) => {
  const kind = getShowStatus(movie)?.kind;
  return isShow(movie) && (kind === "airing" || kind === "season" || kind === "new-episode" || movie.personal?.status === "watching");
};

export function QueuePage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const { library, sync, settings } = useAppState();
  const [kind, setKind] = useState<QueueFilter>("all");
  // Synced with the other settings; an older per-device choice is the starting point.
  const sort: SortMode = settings.sort ?? (readLegacySort() || "added");
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(PAGE);

  const queue = useMemo(() => library.movies.filter((movie) => !movie.watched), [library.movies]);
  const dueToday = queue.filter((movie) => isDueNow(movie)).length;
  const pick = pickTonight(queue, skip);
  const tonight = pick.movie;
  const tonightDue = Boolean(tonight && isDueNow(tonight));
  const alsoDue = pick.due.filter((movie) => movie.id !== tonight?.id);

  const radar = useMemo(() => {
    const now = Date.now();
    return queue
      .map((movie) => ({
        movie,
        at: hasActiveReminder(movie, now) ? Number(movie.remindAt)
          : isUnreleased(movie, now) && /^\d{4}-\d{2}-\d{2}$/.test(movie.releaseDate || "") ? new Date(`${movie.releaseDate}T20:00:00`).getTime() : 0
      }))
      .filter((entry) => entry.at > now && entry.movie.id !== tonight?.id && !isDueNow(entry.movie, now))
      .sort((a, b) => a.at - b.at)
      .slice(0, 8);
  }, [queue, tonight?.id]);

  // A saved backdrop from elsewhere (fanart.tv, say) isn't one we load; TMDB's own stands in for it, without rewriting the saved title.
  const [fetchedBackdrop, setFetchedBackdrop] = useState<{ id: string; url: string }>({ id: "", url: "" });
  const needsBackdrop = Boolean(tonight && !safeImage(tonight.backdrop) && tonight.tmdbId);
  useEffect(() => {
    if (!tonight || !needsBackdrop) return;
    let current = true;
    fetchDetails(tonight, settings.region || "IN")
      .then((details) => { if (current) setFetchedBackdrop({ id: tonight.id, url: safeImage(details.backdrop) }); })
      .catch(() => {});
    return () => { current = false; };
  }, [tonight?.id, tonight?.tmdbId, tonight?.tmdbType, needsBackdrop, settings.region]);
  const tonightBackdrop = safeImage(tonight?.backdrop) || (fetchedBackdrop.id === tonight?.id ? fetchedBackdrop.url : "");

  const watching = useMemo(() => watchingShows(library.movies), [library.movies, settings.region]);
  const onTonight = useMemo(() => airingToday(library.movies, readDismissed()), [library.movies, settings.region]);
  useShowScheduleRefresh(library.movies, settings.region || "IN", sync.connected);

  // The rows above are shortcuts into the queue; the grid doesn't repeat them, unless searching.
  const shownAbove = useMemo(() => new Set([
    tonight?.id, ...alsoDue.map((movie) => movie.id), ...watching.map((entry) => entry.movie.id), ...radar.map((entry) => entry.movie.id)
  ].filter(Boolean) as string[]), [tonight?.id, alsoDue, watching, radar]);
  const matches = queue.filter((movie) => (kind === "airing" ? isAiring(movie) : matchesKind(movie, kind)) && matchesSearch(movie, query));
  const visible = sortMovies(query ? matches : matches.filter((movie) => !shownAbove.has(movie.id)), sort);
  const skipped = matches.length - visible.length;
  useEffect(() => setLimit(PAGE), [kind, sort, query]);

  const changeSort = (mode: SortMode) => updateSettings({ sort: mode });

  return (
    <>
      {!sync.connected ? (
        <Landing />
      ) : (
        <PageHeader
          title="What are we watching?"
          meta={[dueToday ? `${dueToday} due today` : "", `${queue.length} in your queue`, library.movies.length > queue.length ? `${library.movies.length - queue.length} watched` : ""].filter(Boolean).join(" · ")}
        />
      )}

      {sync.connected && tonight && (
        <section className="band tonight">
          <div className="wrap tonight-grid">
            <div
              className={`tonight-art ${!tonightBackdrop && safeImage(tonight.poster) ? "poster-only" : ""}`}
              style={!tonightBackdrop && safeImage(tonight.poster) ? { ["--art" as string]: `url(${safeImage(upscale(tonight.poster, "w342"))})` } : undefined}
            >
              {tonightBackdrop && <Backdrop key={tonightBackdrop} src={tonightBackdrop} />}
              <Poster src={upscale(tonight.poster, "w342")} title={tonight.title} className="tonight-poster" />
            </div>
            <div className="tonight-text" key={tonight.id}>
              {/* On a phone this sits over the backdrop, so the pick takes one screen, not two. */}
              <button type="button" className="tonight-heading" onClick={() => onOpen(tonight.id)} aria-label={`${displayTitle(tonight)}, details`}>
                <span className={`tonight-when ${tonightDue ? "due" : ""}`}>
                  {!tonightDue ? "Tonight's pick" : Number(tonight.remindAt) <= Date.now() ? "Due now" : `Due ${formatReminder(Number(tonight.remindAt))}`}
                  {tonightDue && pick.due.length > 1 && ` · ${pick.place} of ${pick.due.length}`}
                </span>
                <h2>{displayTitle(tonight)}</h2>
                <span className="tonight-meta">
                  {[tonight.mediaType, tonight.year, formatRuntime(tonight.runtimeMinutes), formatRating(tonight.rating) ? `★ ${formatRating(tonight.rating)}` : ""].filter(Boolean).join(" · ")}
                </span>
              </button>
              {tonight.tagline && <p className="tonight-tagline">{tonight.tagline}</p>}
              <div className="button-row tonight-actions" onClickCapture={(event) => pop((event.target as Element).closest(".button"))}>
                <button type="button" className="button button-lime" onClick={() => actions.toggleWatched(tonight.id)}>
                  <Icon name="eye" size={16} /> Watched it
                </button>
                <button type="button" className="button button-outline-light" onClick={() => onOpen(tonight.id)}>Details</button>
                {isDueNow(tonight) && (
                  <button type="button" className="button button-outline-light icon-when-small" aria-label="Snooze a day" title="Snooze a day" onClick={() => actions.snooze(tonight.id)}>
                    <Icon name="clock" size={16} /> <span>Snooze a day</span>
                  </button>
                )}
                {queue.length > 1 && (
                  <button type="button" className="button button-outline-light icon-when-small" aria-label={tonightDue && pick.place < pick.due.length ? "Next due" : "Another pick"} title={tonightDue && pick.place < pick.due.length ? "Next due" : "Another pick"} onClick={() => setSkip((value) => value + 1)}>
                    <Icon name="shuffle" size={16} /> <span>Another</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {sync.connected && <TonightStrip entries={onTonight} onOpen={onOpen} />}

      {sync.connected && (alsoDue.length > 0 || watching.length > 0 || radar.length > 0) && (
        // Side by side on a wide screen: each row is short, and a band each would be mostly empty.
        <section className="paper radar rails">
          <div className="wrap rails-grid">
            {alsoDue.length > 0 && (
              <div className="rail" aria-labelledby="also-due-title">
                <h2 id="also-due-title" className="section-title">Also due <span className="count">{alsoDue.length}</span></h2>
                <ul className="radar-list">
                  {alsoDue.map((movie) => (
                    <li key={movie.id}>
                      <button type="button" className="radar-item" onClick={() => onOpen(movie.id)}>
                        <Poster src={movie.poster} title={movie.title} className="radar-poster" />
                        <span className="radar-text">
                          <span className="radar-when tone-due">{cardLine(movie)}</span>
                          <span className="radar-title">{displayTitle(movie)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {watching.length > 0 && (
              <div className="rail" aria-labelledby="watching-title">
                <h2 id="watching-title" className="section-title">Watching <span className="count">{watching.length}</span></h2>
                <ul className="radar-list">
                {watching.map(({ movie, label, detail, tone }) => {
                  const progress = seasonProgress(movie).filter((season) => season.seen > 0).at(-1);
                  return (
                    <li key={movie.id}>
                      <button type="button" className="radar-item" onClick={() => onOpen(movie.id)}>
                        <Poster src={movie.poster} title={movie.title} className="radar-poster" />
                        <span className="radar-text">
                          <span className={`radar-when tone-${tone}`}>{label}</span>
                          <span className="radar-title">{displayTitle(movie)}</span>
                          {detail && <span className="radar-sub">{detail}</span>}
                          {progress && <span className="radar-sub">Watched S{progress.number} · {progress.seen} of {progress.total}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
              </div>
            )}
            {radar.length > 0 && (
              <div className="rail" aria-labelledby="radar-title">
                <h2 id="radar-title" className="section-title">On your radar</h2>
                <ul className="radar-list">
                {radar.map(({ movie, at }) => (
                  <li key={movie.id}>
                    <button type="button" className="radar-item" onClick={() => onOpen(movie.id)}>
                      <Poster src={movie.poster} title={movie.title} className="radar-poster" />
                      <span className="radar-text">
                        <span className="radar-when">
                          {hasActiveReminder(movie)
                            ? <><Icon name="clock" size={11} /> {shortDay(at)}</>
                            : `Out ${shortDay(at, Date.now(), false).replace(/^(Today|Tomorrow)$/, (day) => day.toLowerCase())}`}
                        </span>
                        <span className="radar-title">{displayTitle(movie)}</span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {sync.connected && <section className="paper titles queue-titles" id="titles" tabIndex={-1}>
        <div className="wrap">
          <div className="toolbar">
            <h2 className="section-title">Queue <span className="count">{matches.length}</span></h2>
            <div className="segmented" role="group" aria-label="Show">
              {(["all", "movie", "tv", "airing"] as QueueFilter[]).map((value) => (
                <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                  {value === "all" ? "All" : value === "movie" ? "Films" : value === "tv" ? "Shows" : "Airing"}
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

          {skipped > 0 && visible.length > 0 && <p className="muted small-print queue-note">The {skipped} shown above aren't repeated here.</p>}
          {visible.length ? (
            <>
              <div className="grid">
                {visible.slice(0, limit).map((movie, index) => <TitleCard key={movie.id} movie={movie} onOpen={onOpen} priority={index < 6} />)}
              </div>
              {visible.length > limit && (
                <div className="load-more">
                  <button type="button" className="button button-quiet" onClick={() => setLimit(limit + PAGE)}>Show more · {visible.length - limit} left</button>
                </div>
              )}
            </>
          ) : skipped > 0 ? (
            <p className="empty">Everything here is in the rows above.</p>
          ) : (
            <p className="empty">
              {query ? `Nothing in your queue matches “${query}”.` : queue.length ? "Nothing matches this filter." : "Your queue is empty. Find something in Discover."}
            </p>
          )}
        </div>
      </section>}
    </>
  );
}
