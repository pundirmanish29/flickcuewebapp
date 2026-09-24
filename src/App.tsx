import { useCallback, useEffect, useState } from "react";
import { Icon, Logo, type IconName } from "./components/Icon";
import { TitleSheet } from "./components/TitleSheet";
import { ToastHost } from "./components/Toast";
import { displayTitle } from "./lib/rules";
import { connect, getState, startBackgroundSync, sync, useAppState } from "./lib/store";
import { DiscoverPage } from "./pages/DiscoverPage";
import { QueuePage } from "./pages/QueuePage";
import { SettingsPage } from "./pages/SettingsPage";
import { WatchedPage } from "./pages/WatchedPage";

type Route = "queue" | "discover" | "watched" | "settings";

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
  const route = NAV.some((item) => item.route === first) ? (first as Route) : "queue";
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
  if (!state.connected) {
    return (
      <button type="button" className="sync-pill" onClick={() => void connect()}>
        <span className="dot dot-off" /> <Icon name="sync" size={14} /> <span className="sync-label">Sign in to sync</span>
      </button>
    );
  }
  if (state.status === "needs-auth") {
    return (
      <button type="button" className="sync-pill warn" onClick={() => void connect()} title="Google access expired">
        <span className="dot dot-warn" /> <span className="sync-label">Reconnect</span>
      </button>
    );
  }
  const label = state.status === "syncing" ? "Syncing" : state.status === "error" ? "Sync failed" : "Synced";
  return (
    <button type="button" className={`sync-pill ${state.status === "error" ? "warn" : ""}`} onClick={() => void sync()} title={state.error || "Sync now"}>
      {state.account?.photo ? <img src={state.account.photo} alt="" referrerPolicy="no-referrer" /> : <span className={`dot ${state.status === "error" ? "dot-warn" : "dot-on"}`} />}
      <span className={state.status === "syncing" ? "spin" : ""}><Icon name="sync" size={14} /></span>
      <span className="sync-label">{label}</span>
    </button>
  );
}

export default function App() {
  const { route, titleId } = useHashRoute();
  const { library } = useAppState();
  const [query, setQuery] = useState("");

  useEffect(() => startBackgroundSync(), []);
  useReminderNotifications();

  useEffect(() => {
    sessionStorage.setItem("flickcue.lastRoute", route);
    setQuery("");
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
  const navigate = (next: string) => {
    location.hash = `#/${next === "queue" ? "" : next}`;
  };

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="brand" href="#/" aria-label="FlickCue home">
            <Logo />
            <span className="brand-name">FLICKCUE</span>
          </a>
          <nav className="top-nav" aria-label="Main">
            {NAV.map((item) => (
              <a key={item.route} href={`#/${item.route === "queue" ? "" : item.route}`} aria-current={route === item.route ? "page" : undefined}>
                {item.label}
                {item.route === "queue" && queueCount > 0 && <span className="nav-count">{queueCount}</span>}
              </a>
            ))}
          </nav>
          {route !== "settings" && (
            <label className="search">
              <Icon name="search" size={16} />
              <span className="visually-hidden">Search</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={route === "discover" ? "Search films and shows" : "Search your titles"}
              />
            </label>
          )}
          <SyncIndicator />
        </div>
      </header>

      <main id="main">
        {route === "queue" && <QueuePage onOpen={openTitle} query={query} onNavigate={navigate} />}
        {route === "discover" && <DiscoverPage onOpen={openTitle} query={query} />}
        {route === "watched" && <WatchedPage onOpen={openTitle} query={query} />}
        {route === "settings" && <SettingsPage />}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <span className="brand"><Logo size={8} /> <span className="brand-name">FLICKCUE</span></span>
          <span className="muted">Works with the FlickCue extension and Android app.</span>
          <span className="muted">Title data from TMDB.</span>
        </div>
      </footer>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((item) => (
          <a key={item.route} href={`#/${item.route === "queue" ? "" : item.route}`} aria-current={route === item.route ? "page" : undefined}>
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {titleId && <TitleSheet key={titleId} id={titleId} onClose={closeTitle} />}
      <ToastHost />
    </>
  );
}
