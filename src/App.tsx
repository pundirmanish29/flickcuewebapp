import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AccountMenu, timeAgo } from "./components/AccountMenu";
import { ScrollJump } from "./components/ScrollJump";
import { ThemeToggle } from "./components/ThemeToggle";
import { Icon, Logo, type IconName } from "./components/Icon";
import { TitleSheet } from "./components/TitleSheet";
import { closePreview, usePreview } from "./lib/preview";
import { ToastHost } from "./components/Toast";
import { ContactReveal } from "./components/ContactReveal";
import { canAskExtension, preloadGoogleSignIn } from "./lib/auth";
import { EXTENSION_URL } from "./lib/config";
import { onPhone } from "./lib/device";
import { pauseNotice, pendingChanges } from "./lib/pending";
import { displayTitle } from "./lib/rules";
import { connect, getState, startBackgroundSync, useAppState } from "./lib/store";
import { DiscoverPage } from "./pages/DiscoverPage";
import { NotificationBell, NotificationsPage } from "./pages/NotificationsPage";
import { PageLabel, directionBetween } from "./components/PageLabel";
import { buildNotifications } from "./lib/notifications";
import { hasIntent, onIntent, takeIntent } from "./lib/discoverIntent";
import { openTitle as openWithMotion, transition, transitionRunning } from "./lib/motion";
import { QueuePage } from "./pages/QueuePage";
import { SettingsPage } from "./pages/SettingsPage";
import { WatchedPage } from "./pages/WatchedPage";

type Route = "queue" | "discover" | "watched" | "settings" | "notifications";

const SITE_TITLE = "FlickCue — One watchlist. Everywhere.";
const PAGE_TITLES: Record<Route, string> = { queue: "Queue", discover: "Discover", watched: "Watched", settings: "Settings", notifications: "Notifications" };

const AUTHENTICATED_ROUTES = new Set<Route>(["discover", "watched", "settings", "notifications"]);
// Pages whose lists the header search filters (Discover searches everything).
const SEARCHABLE = new Set<Route>(["queue", "discover", "watched"]);
// A #/title/<id> link followed while signed out (the extension's "Notes &
// progress" link, say), kept for this tab and opened once signing in has
// brought the list. Opened straight away, it would find nothing and close.
const PENDING_TITLE_KEY = "flickcue.pendingTitle";

// The phone's dock: where you go, icons only. The bell stays in the top bar, beside the account.
const DOCK: { route: Route; label: string; icon: IconName }[] = [
  { route: "queue", label: "Queue", icon: "queue" },
  { route: "discover", label: "Discover", icon: "compass" },
  { route: "watched", label: "Watched", icon: "eye" },
  { route: "settings", label: "Settings", icon: "gear" }
];
// What the phone header says about where you are.
const PAGE_LABELS: Record<Route, string> = { queue: "Queue", discover: "Discover", watched: "Watched", settings: "Settings", notifications: "Notifications" };

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: "queue", label: "Queue", icon: "queue" },
  { route: "discover", label: "Discover", icon: "compass" },
  { route: "watched", label: "Watched", icon: "eye" },
  { route: "settings", label: "Settings", icon: "gear" }
];

// Hash routes (#/discover, #/title/<id>) so any static host serves every page.
function parseHash(): { route: Route; titleId: string } {
  const [, first = "", second = ""] = location.hash.replace(/^#/, "").split("/");
  if (first === "title") return { route: (sessionStorage.getItem("flickcue.lastRoute") as Route) || "queue", titleId: decodeURIComponent(second) };
  const route = NAV.some((item) => item.route === first) || first === "notifications" ? (first as Route) : "queue";
  return { route, titleId: "" };
}

function useHashRoute() {
  const [value, setValue] = useState(parseHash);
  const current = useRef(value);
  current.current = value;
  useEffect(() => {
    // Moving between pages cross-fades; opening a title has its own transition (lib/motion.ts).
    const onChange = () => {
      const next = parseHash();
      if (next.route !== current.current.route && !next.titleId && !current.current.titleId && !transitionRunning()) {
        transition(() => flushSync(() => setValue(next)), "page", directionBetween(current.current.route, next.route));
      } else setValue(next);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return value;
}

const EPISODE_KINDS = new Set(["episode", "season", "finale"]);
const ALERTED_KEY = "flickcue.alertedEpisodes";

function readAlerted(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(ALERTED_KEY) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function writeAlerted(ids: string[]) {
  try {
    localStorage.setItem(ALERTED_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Without storage an episode may be announced again on the next visit.
  }
}

/**
 * While the tab is open, a reminder coming due, or a followed show's episode
 * airing today, becomes a browser notification, once each.
 */
function useReminderNotifications() {
  useEffect(() => {
    const notified = new Set<string>();
    const check = () => {
      const { library, settings } = getState();
      if (!settings.notifications || !("Notification" in window) || Notification.permission !== "granted") return;
      const now = Date.now();
      for (const movie of library.movies) {
        const at = Number(movie.remindAt);
        const key = `${movie.id}:${at}`;
        // Only reminders that came due in the last ten minutes, so opening the
        // app after a week doesn't fire a burst of stale ones.
        if (movie.watched || !at || at > now || now - at > 10 * 60 * 1000 || notified.has(key)) continue;
        notified.add(key);
        const notification = new Notification(`Time to watch ${displayTitle(movie)}`, {
          body: [movie.mediaType, movie.year].filter(Boolean).join(" · "),
          icon: movie.poster || "./icon.svg",
          tag: key
        });
        notification.onclick = () => {
          window.focus();
          location.hash = `#/title/${encodeURIComponent(movie.id)}`;
        };
      }

      // A followed show's episode airing today, once per episode on this device.
      const alerted = readAlerted();
      const todayStart = new Date(new Date(now).toDateString()).getTime();
      for (const item of buildNotifications(library.movies, now)) {
        if (!EPISODE_KINDS.has(item.kind) || item.at < todayStart || alerted.includes(item.id)) continue;
        alerted.push(item.id);
        const movie = library.movies.find((entry) => entry.id === item.movieId);
        const notification = new Notification(item.text, { body: item.detail, icon: movie?.poster || "./icon.svg", tag: item.id });
        notification.onclick = () => {
          window.focus();
          location.hash = `#/title/${encodeURIComponent(item.movieId)}`;
        };
      }
      writeAlerted(alerted);
    };
    check();
    const timer = setInterval(check, 30 * 1000);
    return () => clearInterval(timer);
  }, []);
}

function SyncIndicator() {
  const { sync: state } = useAppState();
  if (!state.connected && state.status === "connecting") {
    return (
      <span className="header-sign-in signing" role="status">
        <span className="spin"><Icon name="sync" size={14} /></span> Signing in
      </span>
    );
  }
  if (!state.connected) {
    return (
      <button type="button" className="button button-light header-sign-in" onClick={() => void connect()}>Sign in</button>
    );
  }
  return <AccountMenu />;
}

/** The wait while a first sign-in picks the list up from Drive; after a few seconds it says it is still going, so nobody reloads mid-way. */
function SigningIn() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="wrap signing-in" role="status">
      <span className="loader-dots" aria-hidden="true"><i /><i /><i /></span>
      <p>Signing you in…</p>
      <small>{slow ? "Still working. A long list can take a moment, so there's no need to reload." : "Picking up your list from Google Drive"}</small>
      <span className="loader-lines" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

export default function App() {
  const requestedRoute = useHashRoute();
  const { library, sync, settings } = useAppState();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const preview = usePreview();
  // On phones search is an icon until tapped; with text in it, it stays open.
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || query !== "";
  // Opened and focused in the same tap, so phones raise the keyboard.
  const openSearch = () => {
    flushSync(() => setSearchOpen(true));
    searchInput.current?.focus();
  };
  // While the extension is asked for its session, and then until the list
  // first arrives from Drive, the requested page (or title) is kept rather
  // than swapped for the signed-out homepage or an empty queue. A title opened
  // before its list has loaded would find nothing and close itself.
  const connecting = (!sync.connected && sync.status === "connecting")
    || (sync.connected && sync.lastSyncAt === 0 && (sync.status === "idle" || sync.status === "syncing"));
  const route = !sync.connected && !connecting && AUTHENTICATED_ROUTES.has(requestedRoute.route) ? "queue" : requestedRoute.route;
  // Signed out, only titles in the list kept on this device can open.
  const titleWaitsForSignIn = Boolean(requestedRoute.titleId) && !sync.connected && !connecting
    && !library.movies.some((movie) => movie.id === requestedRoute.titleId);
  const titleId = titleWaitsForSignIn ? "" : requestedRoute.titleId;

  useEffect(() => startBackgroundSync(), []);

  // Google's sign-in script is fetched while the page sits idle, so the first tap on Sign in or Resume opens its window at once.
  const needsSignIn = !sync.connected || sync.status === "needs-auth";
  const pause = sync.connected && sync.status === "needs-auth"
    ? pauseNotice(pendingChanges(library, Number(settings.settingsUpdatedAt) || 0, sync.lastSyncAt), sync.lastSyncAt, Date.now())
    : ({ show: false } as const);
  useEffect(() => {
    if (!needsSignIn) return;
    const idle = window.requestIdleCallback
      ? (callback: () => void) => { const id = window.requestIdleCallback(callback, { timeout: 2500 }); return () => window.cancelIdleCallback(id); }
      : (callback: () => void) => { const id = window.setTimeout(callback, 1200); return () => window.clearTimeout(id); };
    return idle(preloadGoogleSignIn);
  }, [needsSignIn]);
  useReminderNotifications();

  useEffect(() => {
    if (!titleWaitsForSignIn) return;
    try {
      sessionStorage.setItem(PENDING_TITLE_KEY, requestedRoute.titleId);
    } catch {
      // Without storage the link just isn't reopened after signing in.
    }
    history.replaceState(null, "", "#/");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [titleWaitsForSignIn, requestedRoute.titleId]);

  useEffect(() => {
    if (!sync.connected || connecting) return;
    let pending = "";
    try {
      pending = sessionStorage.getItem(PENDING_TITLE_KEY) || "";
      sessionStorage.removeItem(PENDING_TITLE_KEY);
    } catch {
      return;
    }
    if (pending) location.hash = `#/title/${encodeURIComponent(pending)}`;
  }, [sync.connected, connecting]);

  useEffect(() => {
    if (!sync.connected && !connecting && AUTHENTICATED_ROUTES.has(requestedRoute.route)) {
      history.replaceState(null, "", "#/");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, [requestedRoute.route, sync.connected, connecting]);

  // A cast member tapped in a title's details: Discover opens searching for them.
  // A genre tapped there opens Discover's genre, so any search is cleared.
  useEffect(() => onIntent(() => {
    const search = takeIntent("search");
    if (search) setQuery(search);
    else if (hasIntent("genre")) {
      setQuery("");
      setSearchOpen(false);
    }
  }), []);

  useEffect(() => {
    sessionStorage.setItem("flickcue.lastRoute", route);
    setQuery("");
    setSearchOpen(false);
    closePreview();
    window.scrollTo({ top: 0 });
  }, [route]);

  // The tab, history and screen readers name where you are: the page, or the title that's open.
  const openMovie = titleId ? library.movies.find((movie) => movie.id === titleId) : undefined;
  useEffect(() => {
    if (!sync.connected) {
      document.title = SITE_TITLE;
      return;
    }
    const name = openMovie ? displayTitle(openMovie) : PAGE_TITLES[route];
    document.title = `${name} · FlickCue`;
  }, [sync.connected, route, openMovie?.id, openMovie?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // A skip link's own #fragment would be read as a route here, so it moves focus instead.
  const skipTo = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  };

  const queueCount = library.movies.filter((movie) => !movie.watched).length;
  const activeDock = DOCK.findIndex((item) => item.route === route);

  const openTitle = useCallback((id: string) => {
    openWithMotion(() => { location.hash = `#/title/${encodeURIComponent(id)}`; });
  }, []);
  const closeTitle = useCallback(() => {
    // Back to the page underneath, without leaving a history entry to reopen it.
    history.replaceState(null, "", `#/${route === "queue" ? "" : route}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [route]);

  return (
    <>
      <a className="skip-link" href="#main" onClick={skipTo("main")}>Skip to content</a>
      {sync.connected && route === "queue" && <a className="skip-link skip-link-second" href="#titles" onClick={skipTo("titles")}>Skip to your queue</a>}
      <header className="site-header">
        <div className={`wrap header-inner ${searching ? "is-searching" : ""}`}>
          <a className="brand" href="#/" aria-label="FlickCue home">
            <Logo />
            <span className="brand-name">FLICKCUE</span>
          </a>
          {sync.connected && <PageLabel route={route} text={PAGE_LABELS[route]} />}
          {sync.connected && (
            <nav className="top-nav" aria-label="Main">
              {NAV.map((item) => (
                <a key={item.route} href={`#/${item.route === "queue" ? "" : item.route}`} aria-current={route === item.route ? "page" : undefined}>
                  {item.label}
                  {item.route === "queue" && queueCount > 0 && <span className="nav-count">{queueCount}</span>}
                </a>
              ))}
            </nav>
          )}
          {SEARCHABLE.has(route) && sync.connected && (
            <button
              type="button"
              className="header-icon search-back"
              aria-label="Close search"
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
            >
              <Icon name="back" size={21} />
            </button>
          )}
          {SEARCHABLE.has(route) && sync.connected && (
            <label className="search">
              <Icon name="search" size={16} />
              <span className="visually-hidden">Search</span>
              <input
                ref={searchInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setQuery("");
                  setSearchOpen(false);
                }}
                placeholder={route === "discover" ? "Search films and shows" : "Search your titles"}
              />
              {query && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchInput.current?.focus();
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </label>
          )}
          {/* The theme switch lives in the account menu once signed in. */}
          {!sync.connected && <ThemeToggle />}
          {SEARCHABLE.has(route) && sync.connected && (
            <button
              type="button"
              className="header-icon search-open"
              aria-label={route === "discover" ? "Search films and shows" : "Search your titles"}
              onClick={openSearch}
            >
              <Icon name="search" size={21} />
            </button>
          )}
          {sync.connected && <NotificationBell current={route === "notifications"} />}
          <SyncIndicator />
        </div>
      </header>

      {/* A sign-in lasts about an hour and can only be renewed by the person, so a pause is routine: the banner (with its
          button) is for edits waiting to sync or a list long out of step. Otherwise the account menu carries the status. */}
      {pause.show && (
        <div className="sync-banner" role="status">
          <div className="sync-notice">
            <span className="notice-icon" aria-hidden="true"><Icon name="pause" size={18} /></span>
            <div className="notice-text">
              <b>Sync is paused</b>
              <span>
                {pause.reason === "pending"
                  ? `${pause.pending === 1 ? "1 change is" : `${pause.pending} changes are`} waiting. Safe on this device until you resume.`
                  : sync.lastSyncAt ? `Last synced ${timeAgo(sync.lastSyncAt)}. Your changes are safe on this device.` : "Your changes are safe on this device."}
              </span>
            </div>
            <button type="button" className="button button-orange" onClick={() => void connect()}>Resume sync</button>
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1}>
        {connecting && <SigningIn />}
        {!connecting && route === "queue" && <QueuePage onOpen={openTitle} query={query} />}
        {route === "discover" && <DiscoverPage onOpen={openTitle} query={query} />}
        {route === "watched" && <WatchedPage onOpen={openTitle} query={query} />}
        {route === "settings" && <SettingsPage />}
        {route === "notifications" && <NotificationsPage onOpen={openTitle} />}
      </main>

      <footer className={`site-footer ${sync.connected ? "with-bottom-nav" : ""}`}>
        <div className="wrap footer-inner">
          <div className="footer-top">
            <span className="brand"><Logo size={9} /> <span className="brand-name">FLICKCUE</span></span>
            <span className="footer-tag">One watchlist. Everywhere.</span>
            <nav className="footer-links" aria-label="Footer">
              <a className="footer-link" href="./privacy.html">Privacy</a>
              <ContactReveal label="Contact" className="footer-link" />
              {/* Not offered to a phone, or to someone who already has it. */}
              {!onPhone() && !canAskExtension() && <a className="footer-link" href={EXTENSION_URL} target="_blank" rel="noreferrer">Chrome extension</a>}
              <span className="footer-chip">Android soon</span>
            </nav>
          </div>
          <div className="footer-fine">
            <span>Your list lives in your own Google Drive.</span>
            <span>Not affiliated with any streaming service.</span>
          </div>
        </div>
      </footer>

      {/* The phone's dock: the four pages, icons only (search is the round button in the header, beside the bell). The highlight glides to the chosen one (CSS, from --i), the icon springs, and the header names the page. */}
      {sync.connected && (
        <div className="dock">
          <nav className="dock-bar" aria-label="Main" style={{ ["--i" as string]: Math.max(activeDock, 0), ["--n" as string]: DOCK.length }}>
            <span className="dock-hl" aria-hidden="true" data-none={activeDock < 0} />
            {DOCK.map((item) => (
              <a key={item.route} href={`#/${item.route === "queue" ? "" : item.route}`} aria-current={route === item.route ? "page" : undefined} title={item.label}>
                <Icon name={item.icon} size={27} />
                <span className="visually-hidden">{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* A title opened from "More like this" sits over the saved one; closing it goes back. */}
      {titleId && !connecting && !preview && <TitleSheet key={titleId} id={titleId} onClose={closeTitle} />}
      {preview && <TitleSheet key={preview.key} candidate={preview} onClose={closePreview} />}
      <ScrollJump />
      <ToastHost />
    </>
  );
}
