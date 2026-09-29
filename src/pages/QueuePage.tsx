import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { TitleCard } from "../components/TitleCard";
import * as actions from "../lib/actions";
import {
  cardLine, displayTitle, formatRating, getShowStatus, isShow, shortDay, seasonProgress, watchingShows, formatReminder, formatRuntime, hasActiveReminder, isDueNow, isUnreleased, matchesKind, matchesSearch, sortMovies
} from "../lib/rules";
import { connect, updateSettings, useAppState } from "../lib/store";
import { PageHeader } from "../components/PageHeader";
import { upscale } from "../lib/tmdb";
import { EXTENSION_URL } from "../lib/config";
import { safeImage } from "../lib/safe";
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

// Empty until the Android app has a public listing; the homepage then says "coming soon".
const ANDROID_URL = "";

/** A phone or tablet, where the Chrome extension can't be installed. */
const onPhone = () => typeof navigator !== "undefined" && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

/** A screenshot of the web app: the phone-shaped one on narrow screens. */
function Shot({ name, alt, eager = false }: { name: string; alt: string; eager?: boolean }) {
  return (
    <picture>
      <source media="(max-width: 700px)" srcSet={`./home-${name}-phone.webp`} width={780} height={1688} />
      <img
        src={`./home-${name}-desktop.webp`}
        alt={alt}
        width={1600}
        height={1000}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        {...(eager ? { fetchPriority: "high" as const } : {})}
      />
    </picture>
  );
}

const FEATURES = [
  {
    shot: "title",
    alt: "FlickCue title details for Slow Horses: next episode tomorrow, where to watch, and episode progress",
    title: "Know what's next",
    text: "Mark a show as Watching and FlickCue keeps up with it: the next episode and when it airs, the ones you've seen, and where to stream it in your country."
  },
  {
    shot: "discover",
    alt: "FlickCue Discover: this week's top 10 shows and what's in cinemas",
    title: "Find something good",
    text: "This week's top 10, what's in cinemas near you, and picks based on what you've saved. Search a film, a show or a director."
  },
  {
    shot: "alerts",
    alt: "FlickCue notifications: reminders due and new seasons out",
    title: "Get a nudge on time",
    text: "Set a reminder for tonight, the weekend or release day, and hear when a new season or episode of something you watch is out."
  }
] as const;

function PrivacyLine() {
  return <p className="home-privacy">Your list lives in your own Google Drive. FlickCue can't see anything else in it, and there's no account with us.</p>;
}

function HomeActions({ large = true }: { large?: boolean }) {
  const phone = onPhone();
  const size = large ? " large" : "";
  return (
    <>
      <div className="button-row">
        <button type="button" className={`button button-ink${size}`} onClick={() => void connect()}>Sign in with Google</button>
        {!phone && (
          <a className={`button button-quiet${size}`} href={EXTENSION_URL} target="_blank" rel="noreferrer">
            <Icon name="plus" size={17} /> Add to Chrome
          </a>
        )}
      </div>
      {phone && (
        <p className="home-extension-note">
          On your computer? <a href={EXTENSION_URL} target="_blank" rel="noreferrer">Add FlickCue to Chrome</a> to save from any page.
        </p>
      )}
    </>
  );
}

function MarketingHome() {
  return (
    <div className="home">
      <section className="home-hero">
        <div className="wrap">
          <p className="eyebrow">Web app · Chrome extension · Android soon</p>
          <h1 className="display">One watchlist.<em>Everywhere.</em></h1>
          <p className="lede">Save films and shows, see what's next for the ones you're watching, and get a nudge when it's time to watch.</p>
          <HomeActions />
          <PrivacyLine />
          <figure className="demo-frame hero-shot">
            <Shot name="queue" alt="The FlickCue queue: tonight's pick, what's due and the shows you're watching" eager />
          </figure>
        </div>
      </section>

      <section className="home-section" aria-labelledby="features-title">
        <div className="wrap">
          <p className="eyebrow">What you get</p>
          <h2 id="features-title" className="home-h2">From “that looks good” to movie night.</h2>
          <div className="features">
            {FEATURES.map((feature) => (
              <article key={feature.shot} className="feature">
                <div className="feature-text">
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
                <figure className="demo-frame feature-shot"><Shot name={feature.shot} alt={feature.alt} /></figure>
              </article>
            ))}
            <article className="feature">
              <div className="feature-text">
                <h3>Save it from any page</h3>
                <p>With the FlickCue Chrome extension, one click on a review, trailer or streaming page adds the film or show to your list.</p>
                <p><a href={EXTENSION_URL} target="_blank" rel="noreferrer">Add to Chrome</a></p>
              </div>
              <figure className="demo-frame feature-shot">
                <img src="./flickcue-extension-04.webp" alt="The FlickCue save card on a film page, with a Want to watch button" width={1280} height={800} loading="lazy" decoding="async" />
              </figure>
            </article>
          </div>
          <ul className="home-extras">
            <li>Where to stream it, for your country</li>
            <li>Your ratings, with Letterboxd's</li>
            <li>Tick off episodes as you go</li>
            <li>One list on every device</li>
          </ul>
        </div>
      </section>

      <section className="home-section home-cta" aria-labelledby="cta-title">
        <div className="wrap home-cta-inner">
          <h2 id="cta-title" className="home-h2">Your next great watch deserves better than a screenshot.</h2>
          <HomeActions />
          <PrivacyLine />
          <p className="home-note">
            {ANDROID_URL ? <a href={ANDROID_URL} target="_blank" rel="noreferrer">Get the Android app</a> : "Android app coming soon"}
            {" · "}<a href="./privacy.html">Privacy</a>
          </p>
        </div>
      </section>
    </div>
  );
}

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
const PAGE = 40;

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

  const watching = useMemo(() => watchingShows(library.movies), [library.movies]);
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
        <MarketingHome />
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
              className={`tonight-art ${!tonight.backdrop && tonight.poster ? "poster-only" : ""}`}
              style={!safeImage(tonight.backdrop) && safeImage(tonight.poster) ? { ["--art" as string]: `url(${safeImage(upscale(tonight.poster, "w342"))})` } : undefined}
            >
              {safeImage(tonight.backdrop) && <Backdrop key={tonight.backdrop} src={safeImage(tonight.backdrop)} />}
              <Poster src={upscale(tonight.poster, "w342")} title={tonight.title} className="tonight-poster" />
            </div>
            <div className="tonight-text">
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
              <div className="button-row tonight-actions">
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

      {sync.connected && <section className="paper titles queue-titles" id="titles">
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
                {visible.slice(0, limit).map((movie) => <TitleCard key={movie.id} movie={movie} onOpen={onOpen} />)}
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
