import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Poster } from "../components/Poster";
import { buildNotifications, cinemaFirstSeen, stampEpisodes, countUnread, getSeenAt, markSeen, type FlickNotification, type NotificationKind } from "../lib/notifications";
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
  return useMemo(() => {
    const cinema = inCinemas ? { keys: inCinemas, firstSeen: cinemaFirstSeen(library.movies, inCinemas, now), place } : undefined;
    return stampEpisodes(buildNotifications(library.movies, now, cinema), now);
  }, [library.movies, now, inCinemas, place]);
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

/** The header bell, with how many notifications arrived since the page was last opened. */
export function NotificationBell({ current }: { current: boolean }) {
  const unread = countUnread(useNotifications(), useSeenAt());
  const label = unread ? `Notifications, ${unread} new` : "Notifications";
  return (
    <a className="header-icon" href="#/notifications" aria-label={label} aria-current={current ? "page" : undefined}>
      <Icon name="bell" size={21} />
      {unread > 0 && <span className="header-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </a>
  );
}

function when(at: number, now: number): string {
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 12 * 60) return `${Math.round(minutes / 60)} h ago`;
  const day = formatRelativeDay(at, now);
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function NotificationList({ items, unread, onOpen }: { items: FlickNotification[]; unread: boolean; onOpen: (id: string) => void }) {
  const { library } = useAppState();
  const now = Date.now();
  return (
    <ul className="notification-list">
      {items.map((item) => {
        const movie = library.movies.find((entry) => entry.id === item.movieId);
        return (
          <li key={item.id}>
            <button type="button" className={`notification ${unread ? "unread" : ""}`} onClick={() => onOpen(item.movieId)}>
              <span className="notification-art">
                <Poster src={upscale(movie?.poster, "w185")} title={movie?.title || item.text} className="notification-poster" />
                <span className={`notification-kind kind-${item.kind}`}><Icon name={KIND_ICON[item.kind]} size={12} /></span>
              </span>
              <span className="notification-text">
                <b>{item.text}</b>
                <span>{item.detail} · {DAY_KINDS.has(item.kind) ? capitalize(formatRelativeDay(item.airedAt ?? item.at, now)) : when(item.at, now)}</span>
              </span>
              {unread && <span className="notification-dot" aria-label="New" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function NotificationsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const items = useNotifications();
  const { settings } = useAppState();
  // What counted as new when the page opened stays marked for this visit,
  // while the bell clears straight away.
  const [seenBefore] = useState(getSeenAt);
  useEffect(() => markSeen(), [items.length]);

  const fresh = items.filter((item) => item.at > seenBefore);
  const earlier = items.filter((item) => item.at <= seenBefore);

  return (
    <>
    <PageHeader
      title="Notifications"
      meta={<>Reminders, releases and new episodes of shows you watch.{!settings.notifications && <> <a href="#/settings">Turn on browser alerts</a></>}</>}
    />
    <section className="paper notifications">
      <div className="wrap notifications-wrap">

        {items.length === 0 ? (
          <div className="notifications-empty">
            <span className="notifications-empty-icon"><Icon name="bell" size={26} /></span>
            <p><b>You're all caught up.</b></p>
            <p className="muted">When a reminder comes due, a saved film is released or a new episode airs, it shows up here.</p>
          </div>
        ) : (
          <>
            {fresh.length > 0 && (
              <>
                <h2 className="notifications-group">New</h2>
                <NotificationList items={fresh} unread onOpen={onOpen} />
              </>
            )}
            {earlier.length > 0 && (
              <>
                <h2 className="notifications-group">{fresh.length ? "Earlier" : "Recent"}</h2>
                <NotificationList items={earlier} unread={false} onOpen={onOpen} />
              </>
            )}
          </>
        )}
      </div>
    </section>
    </>
  );
}
