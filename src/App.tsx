import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AccountMenu } from "./components/AccountMenu";
import { Icon, Logo, type IconName } from "./components/Icon";
import { TitleSheet } from "./components/TitleSheet";
import { closePreview, usePreview } from "./lib/preview";
import { ToastHost } from "./components/Toast";
import { displayTitle } from "./lib/rules";
import { connect, getState, startBackgroundSync, useAppState } from "./lib/store";
import { DiscoverPage } from "./pages/DiscoverPage";
import { NotificationBell, NotificationsPage } from "./pages/NotificationsPage";
import { QueuePage } from "./pages/QueuePage";
import { SettingsPage } from "./pages/SettingsPage";
import { WatchedPage } from "./pages/WatchedPage";

type Route = "queue" | "discover" | "watched" | "settings" | "notifications";

const AUTHENTICATED_ROUTES = new Set<Route>(["discover", "watched", "settings", "notifications"]);
// Pages whose lists the header search filters (Discover searches everything).
const SEARCHABLE = new Set<Route>(["queue", "discover", "watched"]);
// A #/title/<id> link followed while signed out (the extension's "Notes &
// progress" link, say), kept for this tab and opened once signing in has
// brought the list. Opened straight away, it would find nothing and close.
const PENDING_TITLE_KEY = "flickcue.pendingTitle";

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
  useEffect(() => {
    const onChange = () => setValue(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return value;
}

/** While the tab is open, a reminder coming due becomes a browser notification, once per reminder. */
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
      <button type="button" className="button button-lime header-sign-in" onClick={() => void connect()}>Sign in</button>
    );
  }
  return <AccountMenu />;
}

export default function App() {
  const requestedRoute = useHashRoute();
  const { library, sync } = useAppState();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const preview = usePreview();
  // On phones search is an icon until tapped; with text in it, it stays open.
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || query !== "";
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

  useEffect(() => {
    sessionStorage.setItem("flickcue.lastRoute", route);
    setQuery("");
    setSearchOpen(false);
    closePreview();
    window.scrollTo({ top: 0 });
  }, [route]);

  const queueCount = library.movies.filter((movie) => !movie.watched).length;

  const openTitle = useCallback((id: string) => {
    location.hash = `#/title/${encodeURIComponent(id)}`;
  }, []);
  const closeTitle = useCallback(() => {
    // Back to the page underneath, without leaving a history entry to reopen it.
    history.replaceState(null, "", `#/${route === "queue" ? "" : route}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [route]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className={`wrap header-inner ${searching ? "is-searching" : ""}`}>
          <a className="brand" href="#/" aria-label="FlickCue home">
            <Logo />
            <span className="brand-name">FLICKCUE</span>
          </a>
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
          {SEARCHABLE.has(route) && sync.connected && (
            <button
              type="button"
              className="header-icon search-toggle"
              aria-label={route === "discover" ? "Search films and shows" : "Search your titles"}
              onClick={() => {
                // Opened and focused in the same tap, so phones raise the keyboard.
                flushSync(() => setSearchOpen(true));
                searchInput.current?.focus();
              }}
            >
              <Icon name="search" size={21} />
            </button>
          )}
          {sync.connected && <NotificationBell current={route === "notifications"} />}
          <SyncIndicator />
        </div>
      </header>

      <main id="main">
        {connecting && (
          <div className="wrap signing-in" role="status">
            <span className="spin"><Icon name="sync" size={20} /></span>
            <p>Signing you in…</p>
          </div>
        )}
        {!connecting && route === "queue" && <QueuePage onOpen={openTitle} query={query} />}
        {route === "discover" && <DiscoverPage onOpen={openTitle} query={query} />}
        {route === "watched" && <WatchedPage onOpen={openTitle} query={query} />}
        {route === "settings" && <SettingsPage />}
        {route === "notifications" && <NotificationsPage onOpen={openTitle} />}
      </main>

      <footer className={`site-footer ${sync.connected ? "with-bottom-nav" : ""}`}>
        <div className="wrap footer-inner">
          <span className="brand"><Logo size={8} /> <span className="brand-name">FLICKCUE</span></span>
          <span className="muted">Works with the FlickCue Chrome extension.</span>
          <a className="muted footer-link" href="./privacy.html">Privacy</a>
        </div>
      </footer>

      {sync.connected && (
        <nav className="bottom-nav" aria-label="Main" style={{ gridTemplateColumns: `repeat(${NAV.length}, 1fr)` }}>
          {NAV.map((item) => (
            <a key={item.route} href={`#/${item.route === "queue" ? "" : item.route}`} aria-current={route === item.route ? "page" : undefined}>
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      )}

      {titleId && !connecting && <TitleSheet key={titleId} id={titleId} onClose={closeTitle} />}
      {preview && !titleId && <TitleSheet key={preview.key} candidate={preview} onClose={closePreview} />}
      <ToastHost />
    </>
  );
}
