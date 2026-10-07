import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Poster } from "../components/Poster";
import { SwipeRow } from "../components/SwipeRow";
import { toast } from "../components/Toast";
import { buildNotifications, cinemaFirstSeen, stampEpisodes, countUnread, dismiss, DISMISSED_EVENT, getDismissed, getSeenAt, markSeen, olderReminders, undismiss, type FlickNotification, type NotificationKind } from "../lib/notifications";
import * as actions from "../lib/actions";
import { alertSupport } from "../lib/alerts";
import { pop, useSwap } from "../lib/motion";
import { useInCinemas, useWhere } from "../lib/useCinemas";
import { formatRelativeDay } from "../lib/rules";
import { useAppState } from "../lib/store";
import { upscale } from "../lib/tmdb";

const SEEN_EVENT = "flickcue:notifications-seen";
// Things that happen on a day, not at a time: shown as "Today", "Yesterday", "Sep 12".
const DAY_KINDS = new Set<NotificationKind>(["release", "premiere", "episode", "season", "finale"]);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const KIND_ICON: Record<NotificationKind, IconName> = {
  reminder: "bell",
  ticket: "ticket",
  release: "movie",
  cinema: "movie",
  premiere: "show",
  episode: "play",
  season: "show",
  finale: "star"
};

/** The notifications for the current list, re-worked out every minute so reminders coming due appear. */
function useNotifications(): FlickNotification[] {
  const { library } = useAppState();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  const inCinemas = useInCinemas();
  const { place } = useWhere();
  const [dismissed, setDismissed] = useState(getDismissed);
  useEffect(() => {
    const update = () => setDismissed(getDismissed());
    window.addEventListener(DISMISSED_EVENT, update);
    return () => window.removeEventListener(DISMISSED_EVENT, update);
  }, []);
  return useMemo(() => {
    const cinema = inCinemas ? { keys: inCinemas, firstSeen: cinemaFirstSeen(library.movies, inCinemas, now), place } : undefined;
    return stampEpisodes(buildNotifications(library.movies, now, cinema), now).filter((item) => !dismissed.has(item.id));
  }, [library.movies, now, inCinemas, place, dismissed]);
}

function useSeenAt(): number {
  const [seenAt, setSeenAt] = useState(getSeenAt);
  useEffect(() => {
    const update = () => setSeenAt(getSeenAt());
    window.addEventListener(SEEN_EVENT, update);
    // Another tab that opened notifications counts too.
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SEEN_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return seenAt;
}

// The page Notifications was opened from, for the bell to go back to.
let cameFrom = "#/";
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", (event) => {
    // A hash change the app dispatches itself may carry no old address.
    const from = event.oldURL ? new URL(event.oldURL).hash : "";
    if (location.hash.startsWith("#/notifications") && !from.startsWith("#/notifications") && !from.startsWith("#/title/")) cameFrom = from || "#/";
  });
}

/** The header bell, with how many notifications arrived since the page was last opened. */
export function NotificationBell({ current }: { current: boolean }) {
  const unread = countUnread(useNotifications(), useSeenAt());
  const label = unread ? `Notifications, ${unread} new` : "Notifications";
  return (
    <a
      className="header-icon header-bell"
      href="#/notifications"
      aria-label={current ? "Close notifications" : label}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        // Open already: the bell closes it, back to where you were.
        if (!current) return;
        event.preventDefault();
        location.hash = cameFrom;
      }}
    >
      <Icon name="bell" size={21} />
      {unread > 0 && <span key={unread} className="header-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </a>
  );
}

function when(at: number, now: number): string {
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 12 * 60) return `${Math.round(minutes / 60)} h ago`;
  return capitalize(formatRelativeDay(at, now));
}

/** When it happened, as shown and as sorted: the air or release day, or the reminder's time. */
const shownAt = (item: FlickNotification) => item.airedAt ?? item.at;
const byShown = (a: FlickNotification, b: FlickNotification) => shownAt(b) - shownAt(a);

/** What's new, in a few plain words under the title: "Season 1 Episode 7", "Season 2 Premiere", "New Movie". */
function label(item: FlickNotification): string {
  const [, season, episode] = /^S(\d+) · E(\d+)$/.exec(item.detail) ?? [];
  switch (item.kind) {
    case "episode": return season ? `Season ${season} Episode ${episode}` : "New Episode";
    case "season": return season ? `Season ${season} Premiere` : "New Season";
    case "finale": return season ? `Season ${season} Finale` : "Finale";
    case "release": return "New Movie";
    case "cinema": return "In Cinemas";
    case "premiere": return "New Show";
    case "ticket": return "Did you watch it?";
    default: return item.event.startsWith("Starts at") ? item.event : "Time to Watch";
  }
}

type Filter = "all" | "reminders" | "episodes" | "releases";
const FILTERS: [Filter, string][] = [["all", "All"], ["reminders", "Reminders"], ["episodes", "Episodes"], ["releases", "Releases"]];
const EPISODE_KINDS = new Set<NotificationKind>(["episode", "season", "finale", "premiere"]);
const RELEASE_KINDS = new Set<NotificationKind>(["release", "cinema"]);
const inFilter = (item: FlickNotification, filter: Filter) =>
  filter === "all" || (filter === "reminders" ? item.kind === "reminder" || item.kind === "ticket" : filter === "episodes" ? EPISODE_KINDS.has(item.kind) : RELEASE_KINDS.has(item.kind));

/** Put a notification away, with the chance to bring it back. */
function dismissWithUndo(item: FlickNotification) {
  dismiss(item.id);
  toast(`Dismissed ${item.title}`, { label: "Undo", run: () => undismiss(item.id) });
}

function NotificationList({ items, unread, onOpen }: { items: FlickNotification[]; unread: boolean; onOpen: (id: string) => void }) {
  const { library } = useAppState();
  const now = Date.now();
  return (
    <ul className="notification-list">
      {items.map((item, index) => {
        const movie = library.movies.find((entry) => entry.id === item.movieId);
        const time = DAY_KINDS.has(item.kind) ? capitalize(formatRelativeDay(shownAt(item), now)) : when(item.at, now);
        return (
          // Each card settles in a beat after the one before it (styles.css, from --n).
          // Swipe left to put it away; swipe right on a reminder that's due to mark it watched (with Undo, from the toast).
          <SwipeRow
            key={item.id}
            className={`notification kind-${item.kind} ${unread ? "unread" : ""}`}
            style={{ ["--n" as string]: Math.min(index, 8) }}
            left={{ label: "Dismiss", icon: "close", run: () => dismissWithUndo(item) }}
            right={(item.kind === "reminder" || item.kind === "ticket") && movie && !movie.watched ? { label: "Watched", icon: "eye", run: () => actions.toggleWatched(item.movieId) } : undefined}
          >
            <button type="button" className="notification-open" onClick={() => onOpen(item.movieId)} aria-label={`${item.text}. Open ${item.title}`}>
              <span className="notification-art">
                <Poster src={upscale(movie?.poster, "w185")} retina={upscale(movie?.poster, "w342")} title={movie?.title || item.title} className="notification-poster" />
                <span className={`notification-kind kind-${item.kind}`}><Icon name={KIND_ICON[item.kind]} size={12} /></span>
              </span>
              <span className="notification-text">
                <b>{item.title}{unread && <span className="notification-dot" aria-label="New" />}</b>
                <span className="notification-event">{label(item)}</span>
                <span className="notification-when">{[item.kind === "cinema" || item.kind === "ticket" || (item.kind === "reminder" && item.detail) ? item.detail : "", time].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
            {/* What a reminder asks for, right here; anything else can be put away. */}
            <span className="notification-actions" onClickCapture={(event) => pop((event.target as Element).closest(".button"))}>
              {item.kind === "ticket" && movie && !movie.watched && (
                <>
                  <button type="button" className="button button-green small" onClick={() => actions.toggleWatched(item.movieId)}>Yes, watched</button>
                  <button type="button" className="button button-quiet small" onClick={() => actions.dismissWatchedPrompt(item.movieId)}>Not yet</button>
                </>
              )}
              {item.kind === "reminder" && movie && !movie.watched && (
                <>
                  <button type="button" className="button button-green small" onClick={() => actions.toggleWatched(item.movieId)}>Watched it</button>
                  <button type="button" className="button button-quiet small" onClick={() => actions.snooze(item.movieId)}>Snooze</button>
                </>
              )}
              <button type="button" className="notification-dismiss" onClick={() => dismissWithUndo(item)} aria-label={`Dismiss: ${item.text}`} title="Dismiss">
                <Icon name="close" size={14} />
              </button>
            </span>
          </SwipeRow>
        );
      })}
    </ul>
  );
}

/** Today, this week, earlier: by the day shown. */
function byDay(items: FlickNotification[], now: number) {
  const todayStart = new Date(new Date(now).toDateString()).getTime();
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const groups: { label: string; items: FlickNotification[] }[] = [
    { label: "Today", items: [] }, { label: "This week", items: [] }, { label: "Earlier", items: [] }
  ];
  for (const item of [...items].sort(byShown)) {
    const at = shownAt(item);
    groups[at >= todayStart ? 0 : at >= weekStart ? 1 : 2].items.push(item);
  }
  return groups.filter((group) => group.items.length);
}

/** Browser alerts are off (or can't be turned on from here): say what they do, with the way to turn them on. */
function AlertsPrompt() {
  const { settings } = useAppState();
  const support = alertSupport();
  const on = support === "supported" && settings.notifications && Notification.permission === "granted";
  if (on || support === "unsupported") return null;
  return (
    <div className="alerts-prompt">
      <span className="alerts-prompt-icon" aria-hidden="true"><Icon name="bell" size={18} /></span>
      <div className="alerts-prompt-text">
        <b>Get a nudge on time</b>
        <span>{support === "home-screen" ? "Add FlickCue to your Home Screen to get alerts when a reminder comes due or a new episode is out." : "Browser alerts tell you when a reminder comes due or a new episode is out, while FlickCue is open."}</span>
      </div>
      <a className="button button-ink small" href="#/settings">{support === "home-screen" ? "How to add it" : "Turn on alerts"}</a>
    </div>
  );
}

export function NotificationsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const items = useNotifications();
  const { library } = useAppState();
  const [filter, setFilter] = useState<Filter>("all");
  const body = useRef<HTMLDivElement>(null);
  useSwap(body, filter);
  // What counted as new when the page opened stays marked for this visit,
  // while the bell clears straight away.
  const [seenBefore] = useState(getSeenAt);
  useEffect(() => markSeen(), [items.length]);

  const now = Date.now();
  const newCount = items.filter((item) => item.at > seenBefore).length;
  const counts: Record<Filter, number> = {
    all: items.length,
    reminders: items.filter((item) => inFilter(item, "reminders")).length,
    episodes: items.filter((item) => inFilter(item, "episodes")).length,
    releases: items.filter((item) => inFilter(item, "releases")).length
  };
  const shown = items.filter((item) => inFilter(item, filter));
  const fresh = shown.filter((item) => item.at > seenBefore).sort(byShown);
  const seen = byDay(shown.filter((item) => item.at <= seenBefore), now);
  const older = olderReminders(library.movies, now);

  return (
    <>
    <PageHeader
      title="Notifications"
      meta="Reminders, releases and new episodes of shows you watch."
      stats={items.length ? [{ value: newCount, label: "new", tone: newCount ? "orange" : undefined }, { value: items.length, label: "in all" }] : undefined}
    />
    <section className="paper notifications">
      <div className="wrap notifications-wrap">
        <AlertsPrompt />

        {items.length === 0 ? (
          <div className="notifications-empty">
            <span className="notifications-empty-icon"><Icon name="bell" size={26} /></span>
            <h2>You're all caught up</h2>
            <p className="muted">
              Set a reminder on anything in your queue, keep an eye on something coming out, or mark a show as Watching: when it's time, it shows up here.
            </p>
            <a className="button button-ink" href="#/discover">Find something to watch</a>
          </div>
        ) : (
          <>
            <div className="segmented notifications-filters" role="group" aria-label="Show">
              {FILTERS.filter(([value]) => value === "all" || counts[value] > 0 || filter === value).map(([value, name]) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {name} <span className="filter-count">{counts[value]}</span>
                </button>
              ))}
            </div>
            <p className="notifications-hint">Swipe a card left to put it away, or right to mark a reminder watched.</p>
            <div ref={body}>
            {shown.length === 0 && (
              <p className="empty">Nothing here right now. <button type="button" className="link-button inline" onClick={() => setFilter("all")}>Show everything</button></p>
            )}
            {fresh.length > 0 && (
              <>
                <h2 className="notifications-group is-new">New <span className="count">{fresh.length}</span></h2>
                <NotificationList items={fresh} unread onOpen={onOpen} />
              </>
            )}
            {seen.map((group) => (
              <Fragment key={group.label}>
                <h2 className="notifications-group">{group.label} <span className="count">{group.items.length}</span></h2>
                <NotificationList items={group.items} unread={false} onOpen={onOpen} />
              </Fragment>
            ))}
            </div>
          </>
        )}
        {older > 0 && (
          <p className="notifications-older">
            <a href="#/">{older} older reminder{older === 1 ? " is" : "s are"} still due in your queue</a>
          </p>
        )}
      </div>
    </section>
    </>
  );
}
