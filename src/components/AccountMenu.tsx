import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredToken } from "../lib/auth";
import { letterboxdProfileUrl, letterboxdStats } from "../lib/letterboxd";
import { connect, disconnect, sync, useAppState } from "../lib/store";
import { AccountPrefs } from "./HeaderPrefs";
import { ExtensionIcon, Icon } from "./Icon";
import { Popover } from "./ReminderMenu";

export function timeAgo(time: number) {
  if (!time) return "never";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The signed-in header pill, opening the account, sync state and sign out. */
export function AccountMenu() {
  const { sync: state, library, settings } = useAppState();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const trigger = useRef<HTMLButtonElement>(null);

  // "Synced 3 min ago" is read while the menu is open, so it is redrawn now and then rather than left to go stale.
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => redraw((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, [open]);

  // Moving to another page closes it, whichever way the page changed.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, [open, close]);

  const expired = state.status === "needs-auth";
  const failed = state.status === "error";
  const syncing = state.status === "syncing";
  const held = Boolean(state.held);
  // The ring on the avatar and the sync button's dot take one colour: green in step, blue while working, orange when it needs a look.
  const tone = expired || failed || held ? "warn" : syncing ? "busy" : "ok";
  const label = expired || held ? "Sync paused" : syncing ? "Syncing" : failed ? "Sync failed" : "Synced";
  const pillLabel = expired ? "Paused" : label;
  // One line under the email always says where sync stands and when it last ran, so nothing below it moves when a sync starts or ends.
  const status = expired || held ? "Sync paused" : syncing ? "Syncing…" : failed ? "Sync failed" : state.lastSyncAt ? `Synced ${timeAgo(state.lastSyncAt)}` : "Not synced yet";
  const syncTitle = expired ? "Resume sync" : syncing ? "Syncing…" : held ? "Sync paused" : failed ? "Sync failed. Sync again" : `${status}. Sync now`;
  // Words below the profile only when there is something to do or understand.
  const note = expired
    ? "Google's sign-in lasts about an hour. Your changes are safe on this device."
    : held ? `${state.error} Open Settings to decide.` : failed ? state.error || "Sync failed." : "";
  const viaExtension = getStoredToken()?.source === "extension";
  const lb = settings.letterboxd;
  const lbStats = letterboxdStats(library.movies);
  const lbLine = [
    lbStats.rated && `${lbStats.rated} rated`,
    lbStats.liked && `${lbStats.liked} liked`,
    lbStats.reviewed && `${lbStats.reviewed} review${lbStats.reviewed === 1 ? "" : "s"}`
  ].filter(Boolean).join(" · ");
  const initials = (state.account?.name || state.account?.email || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="account-menu">
      <button
        ref={trigger}
        type="button"
        className={`sync-pill state-${tone}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account. ${label}`}
        // Always the menu, even when paused: Settings and Sign out stay reachable, and Resume is inside it (and in the banner).
        onClick={() => setOpen((value) => !value)}
      >
        {/* The avatar alone while all is well; a small tick on it when sync is working or needs a look. */}
        <span className="pill-av">
          {state.account?.photo
            ? <img src={state.account.photo} alt="" referrerPolicy="no-referrer" />
            : <span className="dot" aria-hidden="true">{state.account ? initials : ""}</span>}
          {tone !== "ok" && (
            <span className="pill-tick" aria-hidden="true">
              {syncing ? <span className="spin"><Icon name="sync" size={9} /></span> : <Icon name="pause" size={9} />}
            </span>
          )}
        </span>
        <span className="sync-label">{pillLabel}</span>
      </button>

      <Popover open={open} onClose={close} label="Account" anchor={trigger}>
        <div className="am">
          <div className={`am-who state-${tone}`}>
            {state.account?.photo
              ? <img src={state.account.photo} alt="" referrerPolicy="no-referrer" />
              : <span className="am-initials" aria-hidden="true">{initials}</span>}
            <div>
              <b>{state.account?.name || "Google account"}</b>
              {state.account?.email && <span>{state.account.email}</span>}
              <span className="am-status" role="status">{status}</span>
            </div>
            <button type="button" className="am-sync" aria-label={syncTitle} title={syncTitle} disabled={syncing} onClick={() => (expired ? void connect() : void sync())}>
              <span className={syncing ? "spin" : ""}><Icon name="sync" size={18} /></span>
            </button>
          </div>
          {viaExtension && <p className="am-chip"><ExtensionIcon size={16} /> Signed in through the extension</p>}

          {note && (
            <div className={`am-note state-${tone}`} role="status">
              <span>{note}</span>
              {(expired || failed) && (
                <button type="button" onClick={() => (expired ? void connect() : void sync())}>{expired ? "Resume sync" : "Retry"}</button>
              )}
            </div>
          )}

          {lb ? (
            <a className="am-lb" href={letterboxdProfileUrl(lb)} target="_blank" rel="noreferrer" onClick={close}>
              <span className="am-lb-icon" aria-hidden="true"><Icon name="star" size={15} /></span>
              <span className="am-lb-text">
                <b>Letterboxd · {lb}</b>
                <span>{lbLine || "Your public profile"}</span>
              </span>
              <Icon name="external" size={15} />
            </a>
          ) : (
            <a className="am-lb" href="#/settings" onClick={close}>
              <span className="am-lb-icon" aria-hidden="true"><Icon name="star" size={15} /></span>
              <span className="am-lb-text">
                <b>Link your Letterboxd</b>
                <span>{lbLine ? `${lbLine} from Letterboxd in your list` : "Show your profile here"}</span>
              </span>
              <Icon name="plus" size={15} />
            </a>
          )}

          <AccountPrefs />

          <div className="am-actions">
            <a className="am-item" href="#/settings" onClick={close}>
              <Icon name="gear" size={16} /> Settings
            </a>
            <div className="am-signout">
              <button
                type="button"
                className="am-item danger"
                aria-describedby="am-signout-note"
                onClick={() => {
                  close();
                  void disconnect();
                }}
              >
                <Icon name="signOut" size={16} /> Sign out
              </button>
              <p id="am-signout-note" className="am-fine">Your list stays in your Google Drive.</p>
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}
