import { useCallback, useState } from "react";
import { getStoredToken } from "../lib/auth";
import { connect, disconnect, sync, useAppState } from "../lib/store";
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
  const { sync: state, library } = useAppState();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const expired = state.status === "needs-auth";
  const failed = state.status === "error";
  const syncing = state.status === "syncing";
  const label = expired ? "Reconnect" : syncing ? "Syncing" : failed ? "Sync failed" : "Synced";
  const status = expired
    ? "Google access expired. Reconnect to keep syncing."
    : syncing ? "Syncing…" : failed ? state.error || "Sync failed." : `Synced ${timeAgo(state.lastSyncAt)}`;
  const viaExtension = getStoredToken()?.source === "extension";
  const titles = library.movies.length;

  return (
    <div className="account-menu">
      <button
        type="button"
        className={`sync-pill ${expired || failed ? "warn" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account. ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        {state.account?.photo
          ? <img src={state.account.photo} alt="" referrerPolicy="no-referrer" />
          : <span className={`dot ${expired || failed ? "dot-warn" : "dot-on"}`} />}
        <span className={syncing ? "spin" : ""}><Icon name="sync" size={14} /></span>
        <span className="sync-label">{label}</span>
      </button>

      <Popover open={open} onClose={close} label="Account">
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
        <div className="account-actions">
          {expired ? (
            <button type="button" className="account-item" onClick={() => connect()}>
              <Icon name="sync" size={16} /> Reconnect
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
