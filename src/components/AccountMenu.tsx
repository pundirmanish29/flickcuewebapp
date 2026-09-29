import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredToken } from "../lib/auth";
import { letterboxdProfileUrl, letterboxdStats } from "../lib/letterboxd";
import { connect, disconnect, sync, useAppState } from "../lib/store";
import { AccountPrefs } from "./HeaderPrefs";
import { Icon } from "./Icon";
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

  // Moving to another page closes it, whichever way the page changed.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, [open, close]);

  const expired = state.status === "needs-auth";
  const failed = state.status === "error";
  const syncing = state.status === "syncing";
  const label = expired ? "Resume sync" : syncing ? "Syncing" : state.held ? "Sync paused" : failed ? "Sync failed" : "Synced";
  const status = expired
    ? "Sync paused. Your changes are saved on this device."
    : syncing ? "Syncing…" : state.held ? `${state.error} Open Settings to decide.` : failed ? state.error || "Sync failed." : `Synced ${timeAgo(state.lastSyncAt)}`;
  const viaExtension = getStoredToken()?.source === "extension";
  const titles = library.movies.length;
  const lb = settings.letterboxd;
  const lbStats = letterboxdStats(library.movies);
  const lbLine = [
    lbStats.rated && `${lbStats.rated} rated`,
    lbStats.liked && `${lbStats.liked} liked`,
    lbStats.reviewed && `${lbStats.reviewed} review${lbStats.reviewed === 1 ? "" : "s"}`
  ].filter(Boolean).join(" · ");

  return (
    <div className="account-menu">
      <button
        ref={trigger}
        type="button"
        className={`sync-pill ${expired || failed ? "warn" : ""}`}
        aria-haspopup={expired ? undefined : "dialog"}
        aria-expanded={expired ? undefined : open}
        aria-label={`Account. ${label}`}
        // Paused, the pill resumes sync in one tap; Google's sign-in needs the tap anyway.
        onClick={() => (expired ? void connect() : setOpen((value) => !value))}
      >
        {state.account?.photo
          ? <img src={state.account.photo} alt="" referrerPolicy="no-referrer" />
          : <span className={`dot ${expired || failed ? "dot-warn" : "dot-on"}`} />}
        <span className={syncing ? "spin" : ""}><Icon name="sync" size={14} /></span>
        <span className="sync-label">{label}</span>
      </button>

      <Popover open={open} onClose={close} label="Account" anchor={trigger}>
        <div className="account">
          {state.account?.photo && <img src={state.account.photo} alt="" referrerPolicy="no-referrer" />}
          <div>
            <b>{state.account?.name || "Google account"}</b>
            {state.account?.email && <span className="muted">{state.account.email}</span>}
          </div>
        </div>
        <p className={`account-status ${expired || failed ? "error" : "muted"}`}>
          <span className={`dot ${expired || failed ? "dot-warn" : "dot-on"}`} /> {status}
        </p>
        <p className="account-meta muted">
          {titles} title{titles === 1 ? "" : "s"} in your Google Drive
          {viaExtension ? " · signed in through the FlickCue extension" : ""}
        </p>
        <div className="account-letterboxd">
          {lb ? (
            <a className="account-lb-link" href={letterboxdProfileUrl(lb)} target="_blank" rel="noreferrer" onClick={close}>
              <span className="account-lb-icon" aria-hidden="true"><Icon name="star" size={15} /></span>
              <span className="account-lb-text">
                <b>Letterboxd · {lb}</b>
                <span>{lbLine || "Your public profile"}</span>
              </span>
              <Icon name="external" size={15} />
            </a>
          ) : (
            <a className="account-lb-link" href="#/settings" onClick={close}>
              <span className="account-lb-icon" aria-hidden="true"><Icon name="star" size={15} /></span>
              <span className="account-lb-text">
                <b>Link your Letterboxd</b>
                <span>{lbLine ? `${lbLine} from Letterboxd in your list` : "Show your profile here"}</span>
              </span>
              <Icon name="plus" size={15} />
            </a>
          )}
        </div>
        <AccountPrefs />
        <div className="account-actions">
          {expired ? (
            <button type="button" className="account-item" onClick={() => connect()}>
              <Icon name="sync" size={16} /> Resume sync
            </button>
          ) : (
            <button type="button" className="account-item" disabled={syncing} onClick={() => void sync()}>
              <span className={syncing ? "spin" : ""}><Icon name="sync" size={16} /></span> {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
          <a className="account-item" href="#/settings" onClick={close}>
            <Icon name="gear" size={16} /> Settings
          </a>
          <button
            type="button"
            className="account-item danger"
            onClick={() => {
              close();
              void disconnect();
            }}
          >
            <Icon name="signOut" size={16} /> Sign out
          </button>
        </div>
      </Popover>
    </div>
  );
}
