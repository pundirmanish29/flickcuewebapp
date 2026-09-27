import { useEffect, useMemo, useRef, useState } from "react";
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

const EXTENSION_URL = "https://chromewebstore.google.com/detail/flickcue-watch-later/hmgefidihfkkeleeblhecnhlkbbojmmh?hl=en";
// Empty until the Android app has a public listing; the buttons then read "coming soon".
const ANDROID_URL = "";

function AndroidButton({ className, children }: { className: string; children: string }) {
  if (!ANDROID_URL) {
    return <button type="button" className={className} disabled>{children} · coming soon</button>;
  }
  return (
    <a className={className} href={ANDROID_URL} target="_blank" rel="noreferrer">
      <Icon name="external" size={16} /> {children}
    </a>
  );
}

const SHOWCASE_ITEMS = [
  {
    image: "./flickcue-extension-02.webp",
    alt: "FlickCue browser library overview",
    label: "Library",
    caption: "Everything worth watching, together."
  },
  {
    image: "./flickcue-extension-03.webp",
    alt: "FlickCue saved titles grid with filters",
    label: "Filters",
    caption: "Filter the queue, not your memory."
  },
  {
    image: "./flickcue-extension-05.webp",
    alt: "FlickCue title details, ratings, reminders, and streaming options",
    label: "Details",
    caption: "Ratings, reminders, and where to watch."
  }
] as const;

/** Tonight's pick: whatever is due, else the best-reviewed released title, else anything. */
function pickTonight(queue: Movie[], skip: number): Movie | undefined {
  const released = queue.filter((movie) => !isUnreleased(movie));
  const due = sortMovies(released.filter((movie) => isDueNow(movie)), "reminder");
  const rest = sortMovies(released.filter((movie) => !isDueNow(movie)), "rating");
  const order = [...due, ...rest];
  return order.length ? order[skip % order.length] : undefined;
}

function ProductPreview() {
  const previewRef = useRef<HTMLDivElement>(null);

  const resetTilt = () => {
    previewRef.current?.style.setProperty("--preview-x", "0deg");
    previewRef.current?.style.setProperty("--preview-y", "0deg");
    previewRef.current?.style.setProperty("--preview-shift-x", "0px");
    previewRef.current?.style.setProperty("--preview-shift-y", "0px");
  };

  return (
    <div
      ref={previewRef}
      className="product-preview"
      aria-label="FlickCue browser extension and Android app preview"
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        event.currentTarget.style.setProperty("--preview-x", `${(-y * 2.5).toFixed(2)}deg`);
        event.currentTarget.style.setProperty("--preview-y", `${(x * 3).toFixed(2)}deg`);
        event.currentTarget.style.setProperty("--preview-shift-x", `${(x * 7).toFixed(2)}px`);
        event.currentTarget.style.setProperty("--preview-shift-y", `${(y * 7).toFixed(2)}px`);
      }}
      onPointerLeave={resetTilt}
    >
      <div className="preview-browser published-preview">
        <img src="./flickcue-extension-01.webp" alt="FlickCue extension queue and save interface" />
      </div>
      <a className="preview-store-badge" href={EXTENSION_URL} target="_blank" rel="noreferrer">
        <img src="./flickcue-extension-icon.png" alt="" />
        <span><b>FlickCue · Watch Later</b><small>Available in the Chrome Web Store</small></span>
        <Icon name="external" size={15} />
      </a>
      <div className="preview-phone">
        <div className="preview-phone-top"><span>9:41</span><span className="preview-notch" /></div>
        <div className="preview-phone-brand"><span className="preview-mini-dots"><i /><i /><i /></span> FLICKCUE</div>
        <p className="preview-phone-label">UP NEXT</p>
        <div className="preview-poster poster-red"><span>THE LAST<br />SIGNAL</span></div>
        <strong>Friday is movie night.</strong>
        <p>Ready when you are.</p>
        <button type="button" tabIndex={-1}>Start watching</button>
      </div>
    </div>
  );
}

function MarketingHome({ onNavigate }: { onNavigate: (route: string) => void }) {
  const homeRef = useRef<HTMLDivElement>(null);
  const [activeShot, setActiveShot] = useState(0);
  const selectedShot = SHOWCASE_ITEMS[activeShot];

  useEffect(() => {
    const root = homeRef.current;
    if (!root || !("IntersectionObserver" in window)) return;
    root.classList.add("reveal-ready");
    const sections = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -8%" });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={homeRef} className="marketing-home">
      <section className="flickcue-hero">
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <p className="eyebrow on-dark">Web app · Android · Browser extension</p>
            <h1>One watchlist.<br /><em>Everywhere.</em></h1>
            <p>
              Save films and shows wherever you discover them. FlickCue keeps the context,
              brings the reminder, and helps you finally press play.
            </p>
            <div className="button-row hero-actions">
              <a className="button button-lime large" href={EXTENSION_URL} target="_blank" rel="noreferrer">
                <Icon name="plus" size={17} /> Add to Chrome
              </a>
              <AndroidButton className="button button-outline-light large">Android app</AndroidButton>
            </div>
            <button type="button" className="hero-web-link" onClick={() => onNavigate("discover")}>
              <Icon name="compass" size={14} /> Or start in the web app
            </button>
          </div>
          <ProductPreview />
        </div>
        <p className="hero-footnote">Available on the web, in your browser, and on Android.</p>
      </section>

      <section id="product-story" className="story-intro paper" data-reveal>
        <div className="wrap story-intro-grid">
          <p className="eyebrow">From “that looks good” to movie night</p>
          <h2>Stop losing good recommendations to screenshots and forgotten tabs.</h2>
          <p>FlickCue keeps the whole journey in one calm place, from the first spark of interest to the moment you sit down to watch.</p>
        </div>
      </section>

      <section className="extension-showcase paper" aria-labelledby="extension-showcase-title" data-reveal>
        <div className="wrap">
          <div className="showcase-heading">
            <div>
              <p className="eyebrow">The real extension</p>
              <h2 id="extension-showcase-title">Your whole watchlist, without leaving the browser.</h2>
            </div>
            <a className="button button-ink" href={EXTENSION_URL} target="_blank" rel="noreferrer">
              View in Chrome Web Store <Icon name="external" size={15} />
            </a>
          </div>
          <div className="interactive-showcase">
            <figure className="extension-stage" key={selectedShot.image}>
              <img src={selectedShot.image} alt={selectedShot.alt} />
              <figcaption><span>0{activeShot + 1}</span> {selectedShot.caption}</figcaption>
            </figure>
            <div className="showcase-picker" role="group" aria-label="Extension preview">
              {SHOWCASE_ITEMS.map((item, index) => (
                <button
                  key={item.image}
                  type="button"
                  aria-pressed={activeShot === index}
                  onClick={() => setActiveShot(index)}
                >
                  <img src={item.image} alt="" loading="lazy" />
                  <span><small>0{index + 1}</small>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="story-band story-save" data-reveal>
        <div className="wrap story-grid">
          <div className="story-copy">
            <span className="story-number">01</span>
            <p className="eyebrow">Save from anywhere</p>
            <h2>See it. Cue it.</h2>
            <p>On a review, trailer, streaming page, or recommendation list, the extension saves the title without breaking your flow.</p>
            <a href={EXTENSION_URL} target="_blank" rel="noreferrer">Explore the browser extension <Icon name="external" size={14} /></a>
          </div>
          <div className="published-save-shot" aria-label="FlickCue saving a film from a web page">
            <img src="./flickcue-extension-04.webp" alt="FlickCue save card appearing on a film page" loading="lazy" />
            <span><Icon name="check" size={16} /> Works on film pages across the web</span>
          </div>
        </div>
      </section>

      <section className="story-band story-remind" data-reveal>
        <div className="wrap story-grid story-grid-reverse">
          <div className="reminder-demo" aria-label="FlickCue reminder preview">
            <div className="reminder-time">FRI <b>8:00</b> PM</div>
            <div className="reminder-notification">
              <span className="reminder-icon"><Icon name="bell" size={22} /></span>
              <span><small>FLICKCUE · NOW</small><b>Ready for Paper Moons?</b><p>You saved this for Friday night.</p></span>
            </div>
            <div className="reminder-actions"><span>Snooze</span><strong>Open FlickCue</strong></div>
          </div>
          <div className="story-copy">
            <span className="story-number">02</span>
            <p className="eyebrow">Remember at the right time</p>
            <h2>Your list remembers why.</h2>
            <p>Set a cue for tonight, the weekend, or release day. FlickCue brings the title back when there is actually time to watch it.</p>
          </div>
        </div>
      </section>

      <section className="story-band story-decide" data-reveal>
        <div className="wrap story-grid">
          <div className="story-copy">
            <span className="story-number">03</span>
            <p className="eyebrow on-dark">One list, always with you</p>
            <h2>Pick something good. Quickly.</h2>
            <p>Your ratings, trailers, notes, streaming options, reminders, and progress stay together across the web, extension, and Android app.</p>
            <button type="button" className="button button-lime" onClick={() => onNavigate("discover")}>
              <Icon name="compass" size={16} /> Discover something tonight
            </button>
          </div>
          <div className="sync-demo" aria-label="One watchlist syncing across devices">
            <div className="sync-device sync-browser"><Icon name="queue" size={22} /><span>Browser</span><b>Saved</b></div>
            <span className="sync-line" />
            <div className="sync-core"><span className="preview-mini-dots"><i /><i /><i /></span><b>ONE LIST</b><small>Private Drive sync</small></div>
            <span className="sync-line" />
            <div className="sync-device sync-mobile"><Icon name="bell" size={22} /><span>Android</span><b>Reminded</b></div>
          </div>
        </div>
      </section>

      <section className="availability-cta paper" data-reveal>
        <div className="wrap availability-cta-inner">
          <div>
            <p className="eyebrow">Available now</p>
            <h2>Your next great watch deserves a better place than a screenshot.</h2>
          </div>
          <div className="availability-actions">
            <a className="button button-ink large" href={EXTENSION_URL} target="_blank" rel="noreferrer">Chrome extension <Icon name="external" size={16} /></a>
            <AndroidButton className="button button-quiet large">Android app</AndroidButton>
            <button type="button" className="button button-quiet large" onClick={() => void connect()}>Sign in to web app</button>
          </div>
        </div>
      </section>
    </div>
  );
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
      {!sync.connected ? (
        <MarketingHome onNavigate={onNavigate} />
      ) : (
        <section className="intro compact paper signed-in-intro">
          <div className="wrap signed-in-heading">
            <div>
              <p className="eyebrow">Your FlickCue</p>
              <h1 className="display">What are we watching?</h1>
            </div>
            <p className="library-status">
              {library.movies.length} saved · {queue.length} queued · {library.movies.length - queue.length} watched{dueToday ? ` · ${dueToday} due today` : ""}<br />
              Synced with your extension and Android app.
            </p>
          </div>
        </section>
      )}

      {sync.connected && tonight && (
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

      {sync.connected && <section className="paper titles" id="titles">
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
      </section>}
    </>
  );
}
