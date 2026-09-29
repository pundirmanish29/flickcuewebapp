import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { TitleCard } from "../components/TitleCard";
import * as actions from "../lib/actions";
import {
  displayTitle, formatRating, shortDay, seasonProgress, watchingShows, formatReminder, formatRuntime, hasActiveReminder, isDueNow, isUnreleased, matchesKind, matchesSearch, sortMovies
} from "../lib/rules";
import { connect, useAppState } from "../lib/store";
import { PageHeader } from "../components/PageHeader";
import { upscale } from "../lib/tmdb";
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

const SORT_LABELS: Record<SortMode, string> = {
  added: "Recently added",
  reminder: "Reminder soonest",
  title: "Title A–Z",
  rating: "Best reviewed",
  shortest: "Shortest first"
};

const EXTENSION_URL = "https://chromewebstore.google.com/detail/flickcue-watch-later/hmgefidihfkkeleeblhecnhlkbbojmmh?hl=en";
// Empty until the Android app has a public listing; the homepage then says "coming soon".
const ANDROID_URL = "";

const DEMOS = [
  {
    image: "./flickcue-extension-04.webp",
    alt: "The FlickCue save card on a film page, with a Want to watch button",
    title: "Save it from any page",
    text: "On a review, trailer or streaming page, one click adds the film or show to your list."
  },
  {
    image: "./flickcue-extension-01.webp",
    alt: "The FlickCue extension popup showing the queue with reminders",
    title: "Get a nudge on time",
    text: "Set a reminder for tonight, the weekend or release day. Your queue is one click away."
  },
  {
    image: "./flickcue-extension-05.webp",
    alt: "FlickCue title details with ratings, reminders and streaming options",
    title: "Know where to press play",
    text: "Ratings, notes and streaming options for every title, in one place."
  }
] as const;

function Demo() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const demo = DEMOS[active];

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + DEMOS.length) % DEMOS.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="demo">
      <div className="demo-tabs" role="tablist" aria-label="How FlickCue works" onKeyDown={onKeyDown}>
        {DEMOS.map((item, index) => (
          <button
            key={item.image}
            ref={(node) => { tabs.current[index] = node; }}
            type="button"
            role="tab"
            id={`demo-tab-${index}`}
            aria-selected={active === index}
            aria-controls="demo-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
          >
            <span className="demo-step">0{index + 1}</span>
            <span><b>{item.title}</b><small>{item.text}</small></span>
          </button>
        ))}
      </div>
      <figure className="demo-frame demo-stage" role="tabpanel" id="demo-panel" aria-labelledby={`demo-tab-${active}`}>
        <img key={demo.image} src={demo.image} alt={demo.alt} width={1280} height={800} />
        <figcaption>{demo.text}</figcaption>
      </figure>
    </div>
  );
}

function MarketingHome() {
  return (
    <div className="home">
      <section className="home-hero">
        <div className="wrap">
          <p className="eyebrow">Free Chrome extension · Web app</p>
          <h1 className="display">One watchlist.<em>Everywhere.</em></h1>
          <p className="lede">Save films and shows wherever you find them, and get a nudge when it's time to watch.</p>
          <div className="button-row">
            <a className="button button-ink large" href={EXTENSION_URL} target="_blank" rel="noreferrer">
              <Icon name="plus" size={17} /> Add to Chrome
            </a>
            <button type="button" className="button button-quiet large" onClick={() => void connect()}>Sign in to the web app</button>
          </div>
          <figure className="demo-frame hero-shot">
            <img src="./flickcue-extension-03.webp" alt="The FlickCue library: saved films and shows with ratings and reminders" width={1280} height={800} fetchPriority="high" />
          </figure>
        </div>
      </section>

      <section className="home-section" aria-labelledby="demo-title">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2 id="demo-title" className="home-h2">From “that looks good” to movie night.</h2>
          <Demo />
        </div>
      </section>

      <section className="home-section home-cta" aria-labelledby="cta-title">
        <div className="wrap home-cta-inner">
          <h2 id="cta-title" className="home-h2">Your next great watch deserves better than a screenshot.</h2>
          <div className="button-row">
            <a className="button button-ink large" href={EXTENSION_URL} target="_blank" rel="noreferrer">
              <Icon name="plus" size={17} /> Add to Chrome
            </a>
            <button type="button" className="button button-quiet large" onClick={() => void connect()}>Sign in to the web app</button>
          </div>
          <p className="home-note">
            {ANDROID_URL ? <a href={ANDROID_URL} target="_blank" rel="noreferrer">Get the Android app</a> : "Android app coming soon"}
            {" · "}Your list syncs through your own Google Drive · <a href="./privacy.html">Privacy</a>
          </p>
        </div>
      </section>
    </div>
  );
}

/** Tonight's pick: whatever is due, else the best-reviewed released title, else anything. */
function pickTonight(queue: Movie[], skip: number): Movie | undefined {
  const released = queue.filter((movie) => !isUnreleased(movie));
  const due = sortMovies(released.filter((movie) => isDueNow(movie)), "reminder");
  const rest = sortMovies(released.filter((movie) => !isDueNow(movie)), "rating");
  const order = [...due, ...rest];
  return order.length ? order[skip % order.length] : undefined;
}

export function QueuePage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const { library, sync, settings } = useAppState();
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

  const watching = useMemo(() => watchingShows(library.movies), [library.movies]);
  useShowScheduleRefresh(library.movies, settings.region || "IN", sync.connected);

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
      {!sync.connected ? (
        <MarketingHome />
      ) : (
        <PageHeader
          title="What are we watching?"
          meta={[dueToday ? `${dueToday} due today` : "", `${queue.length} in your queue`, `${library.movies.length - queue.length} watched`].filter(Boolean).join(" · ")}
        />
      )}

      {sync.connected && tonight && (
        <section className="band tonight">
          <div className="wrap tonight-grid">
            <div
              className={`tonight-art ${!tonight.backdrop && tonight.poster ? "poster-only" : ""}`}
              style={!tonight.backdrop && tonight.poster ? { ["--art" as string]: `url(${upscale(tonight.poster, "w342")})` } : undefined}
            >
              {tonight.backdrop && <Backdrop key={tonight.backdrop} src={tonight.backdrop} />}
              <Poster src={upscale(tonight.poster, "w342")} title={tonight.title} className="tonight-poster" />
            </div>
            <div className="tonight-text">
              {/* On a phone this sits over the backdrop, so the pick takes one screen, not two. */}
              <button type="button" className="tonight-heading" onClick={() => onOpen(tonight.id)} aria-label={`${displayTitle(tonight)}, details`}>
                <span className={`tonight-when ${isDueNow(tonight) ? "due" : ""}`}>
                  {!isDueNow(tonight) ? "Tonight's pick" : Number(tonight.remindAt) <= Date.now() ? "Due now" : `Due ${formatReminder(Number(tonight.remindAt))}`}
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
                  <button type="button" className="button button-outline-light icon-when-small" aria-label="Another pick" title="Another pick" onClick={() => setSkip((value) => value + 1)}>
                    <Icon name="shuffle" size={16} /> <span>Another</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {sync.connected && watching.length > 0 && (
        <section className="paper radar watching" aria-labelledby="watching-title">
          <div className="wrap">
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
        </section>
      )}

      {sync.connected && radar.length > 0 && (
        <section className="paper radar">
          <div className="wrap">
            <h2 className="section-title">On your radar</h2>
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
        </section>
      )}

      {sync.connected && <section className="paper titles queue-titles" id="titles">
        <div className="wrap">
          <div className="toolbar">
            <h2 className="section-title">Queue <span className="count">{visible.length}</span></h2>
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
      </section>}
    </>
  );
}
