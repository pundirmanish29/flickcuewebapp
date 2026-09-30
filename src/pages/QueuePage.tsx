import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { TitleCard } from "../components/TitleCard";
import { TonightStrip } from "../components/TonightStrip";
import { airingToday, readDismissed } from "../lib/newEpisode";
import * as actions from "../lib/actions";
import {
  cardLine, displayTitle, formatRating, getShowStatus, isShow, shortDay, seasonProgress, watchingShows, formatReminder, formatRuntime, hasActiveReminder, isDueNow, isUnreleased, matchesKind, matchesSearch, sortMovies
} from "../lib/rules";
import { updateSettings, useAppState } from "../lib/store";
import { PageHeader } from "../components/PageHeader";
import { fetchDetails, fetchSharpBackdrop, upscale } from "../lib/tmdb";
import { safeImage } from "../lib/safe";
import { pop, useSwap } from "../lib/motion";
import { useShowScheduleRefresh } from "../lib/showSync";
import type { KindFilter, Movie, SortMode } from "../lib/types";

// The signed-out page brings its own styles, its animation library and its screenshots' markup,
// so people who are signed in never download them.
const Landing = lazy(() => import("../components/Landing").then((module) => ({ default: module.Landing })));

/** A big screen, or a sharp one, on a connection that isn't saving data: worth fetching the original-size picture. */
function wantsSharpPicture() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? "")) return false;
  return Math.min(window.devicePixelRatio || 1, 2) * window.innerWidth > 1400;
}

/**
 * Tonight's backdrop, behind the pick: a phone-sized copy on small screens, kept hidden
 * behind a shimmer until it has fully loaded, so it never paints in strips. On a big or
 * sharp screen the original-size picture is then fetched and faded in over it, so the
 * page never waits for the large file.
 */
function Backdrop({ src, movie }: { src: string; movie: Movie }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [sharp, setSharp] = useState("");
  const [sharpReady, setSharpReady] = useState(false);

  useEffect(() => {
    if (state !== "ready" || !wantsSharpPicture()) return;
    let live = true;
    fetchSharpBackdrop(movie).then((url) => {
      // Where the title service can't say, the saved picture's own original is the next best thing.
      const best = safeImage(url) || safeImage(upscale(src, "original"));
      if (live && best) setSharp(best);
    });
    return () => {
      live = false;
    };
  }, [state, movie.tmdbId, movie.tmdbType, src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "failed") return null;
  return (
    <>
      {state === "loading" && <span className="tonight-shimmer" aria-hidden="true" />}
      <img
        className={`tonight-backdrop ${state === "ready" ? "ready" : ""}`}
        src={upscale(src, "w1280")}
        srcSet={`${upscale(src, "w780")} 780w, ${upscale(src, "w1280")} 1280w`}
        // Phones take the 780 copy even at 3x: plenty sharp under the panel's gradient, a third the download.
        sizes="(max-width: 600px) 260px, 100vw"
        alt=""
        decoding="async"
        fetchPriority="high"
        onLoad={() => setState("ready")}
        onError={() => setState("failed")}
      />
      {sharp && <img className={`tonight-sharp ${sharpReady ? "ready" : ""}`} src={sharp} alt="" decoding="async" onLoad={() => setSharpReady(true)} onError={() => setSharp("")} />}
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
/** How big the hero's title can be: the longer the name, the smaller, so it always shows whole. */
const titleSize = (title: string) => (title.length > 44 ? "xs" : title.length > 26 ? "s" : title.length > 15 ? "m" : "l");

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
  const gridRef = useRef<HTMLDivElement>(null);
  useSwap(gridRef, `${kind}:${sort}`);

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
        // Dark while it loads, so the light theme's paper doesn't flash before it.
        <Suspense fallback={<div className="landing landing-loading" />}><Landing /></Suspense>
      ) : tonight ? (
        <h1 className="visually-hidden">What are we watching?</h1>
      ) : (
        <PageHeader
          title="What are we watching?"
          meta={[dueToday ? `${dueToday} due today` : "", `${queue.length} in your queue`, library.movies.length > queue.length ? `${library.movies.length - queue.length} watched` : ""].filter(Boolean).join(" · ")}
        />
      )}

      {sync.connected && tonight && (
        <section className="band tonight">
          <div
            className={`tonight-media ${!tonightBackdrop && safeImage(tonight.poster) ? "poster-only" : ""}`}
            style={!tonightBackdrop && safeImage(tonight.poster) ? { ["--art" as string]: `url(${safeImage(upscale(tonight.poster, "w342"))})` } : undefined}
            aria-hidden="true"
          >
            {tonightBackdrop && <Backdrop key={tonightBackdrop} src={tonightBackdrop} movie={tonight} />}
          </div>
          <div className="wrap tonight-inner">
            <div className="tonight-text" key={tonight.id}>
              {/* The pick sits over the picture, so a phone's first screen is the pick and its buttons. */}
              <button type="button" className="tonight-heading" onClick={() => onOpen(tonight.id)} aria-label={`${displayTitle(tonight)}, details`}>
                <span className={`tonight-when ${tonightDue ? "due" : ""}`}>
                  {!tonightDue ? "Tonight's pick" : Number(tonight.remindAt) <= Date.now() ? "Due now" : `Due ${formatReminder(Number(tonight.remindAt))}`}
                  {tonightDue && pick.due.length > 1 && ` · ${pick.place} of ${pick.due.length}`}
                </span>
                <h2 data-size={titleSize(displayTitle(tonight))}>{displayTitle(tonight)}</h2>
                <span className="tonight-meta">
                  {[tonight.mediaType, tonight.year, formatRuntime(tonight.runtimeMinutes), formatRating(tonight.rating) ? `★ ${formatRating(tonight.rating)}` : ""].filter(Boolean).join(" · ")}
                </span>
              </button>
              {tonight.tagline && <p className="tonight-tagline">{tonight.tagline}</p>}
              <div className="button-row tonight-actions" onClickCapture={(event) => pop((event.target as Element).closest(".button"))}>
                <button type="button" className="button button-green" onClick={() => actions.toggleWatched(tonight.id)}>
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
            <Poster key={`poster-${tonight.id}`} src={upscale(tonight.poster, "w342")} title={tonight.title} className="tonight-poster" />
            <ul className="tonight-stats" aria-label="Your queue">
              {dueToday > 0 && <li className="stat due"><b>{dueToday}</b><span>due today</span></li>}
              <li className="stat"><b>{queue.length}</b><span>in your queue</span></li>
              {library.movies.length > queue.length && <li className="stat"><b>{library.movies.length - queue.length}</b><span>watched</span></li>}
            </ul>
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
                        <Poster src={upscale(movie.poster, "w185")} retina={upscale(movie.poster, "w342")} title={movie.title} className="radar-poster" />
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
                        <Poster src={upscale(movie.poster, "w185")} retina={upscale(movie.poster, "w342")} title={movie.title} className="radar-poster" />
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
                      <Poster src={upscale(movie.poster, "w185")} retina={upscale(movie.poster, "w342")} title={movie.title} className="radar-poster" />
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
              <div className="grid" ref={gridRef}>
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
