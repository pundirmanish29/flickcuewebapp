import { useRef, useState } from "react";
import { timeAgo } from "../components/AccountMenu";
import { toast } from "../components/Toast";
import { TMDB_ATTRIBUTION } from "../lib/config";
import { connect, disconnect, importLibrary, sync, updateSettings, useAppState } from "../lib/store";
import type { LibraryDocument } from "../lib/types";

const REGIONS = [
  ["AR", "Argentina"], ["AU", "Australia"], ["AT", "Austria"], ["BE", "Belgium"],
  ["BR", "Brazil"], ["CA", "Canada"], ["CL", "Chile"], ["CO", "Colombia"],
  ["CZ", "Czechia"], ["DK", "Denmark"], ["FI", "Finland"], ["FR", "France"],
  ["DE", "Germany"], ["HK", "Hong Kong"], ["HU", "Hungary"], ["IN", "India"],
  ["ID", "Indonesia"], ["IE", "Ireland"], ["IL", "Israel"], ["IT", "Italy"],
  ["JP", "Japan"], ["MY", "Malaysia"], ["MX", "Mexico"], ["NL", "Netherlands"],
  ["NZ", "New Zealand"], ["NO", "Norway"], ["PH", "Philippines"], ["PL", "Poland"],
  ["PT", "Portugal"], ["SG", "Singapore"], ["ZA", "South Africa"], ["KR", "South Korea"],
  ["ES", "Spain"], ["SE", "Sweden"], ["CH", "Switzerland"], ["TW", "Taiwan"],
  ["TH", "Thailand"], ["TR", "Turkey"], ["GB", "United Kingdom"], ["US", "United States"]
] as const;

export function SettingsPage() {
  const { sync: syncState, settings, library } = useAppState();
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbKey);
  const [region, setRegion] = useState(settings.region);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: Date.now(), ...library }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `flickcue-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const importBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<LibraryDocument>;
      if (!Array.isArray(data.movies)) throw new Error("That file isn't a FlickCue backup.");
      importLibrary({ movies: data.movies, deleted: Array.isArray(data.deleted) ? data.deleted : [] });
      toast(`Imported ${data.movies.length} titles`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't read that file.");
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled && "Notification" in window && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast("Notifications are blocked for this site in your browser settings.");
        return;
      }
    }
    updateSettings({ notifications: enabled });
  };

  return (
    <>
      <section className="settings-page-header paper">
        <div className="wrap settings-page-heading">
          <p className="eyebrow">FlickCue</p>
          <h1>Settings</h1>
          <p>Manage sync, title data, reminders, and backups.</p>
        </div>
      </section>

      <section className="paper">
        <div className="wrap settings">
          <article className="card">
            <h2>Google sync</h2>
            {syncState.connected ? (
              <>
                <div className="account">
                  {syncState.account?.photo && <img src={syncState.account.photo} alt="" referrerPolicy="no-referrer" />}
                  <div>
                    <b>{syncState.account?.name || "Google account"}</b>
                    <span className="muted">{syncState.account?.email}</span>
                  </div>
                </div>
                <p className="muted">
                  {syncState.status === "needs-auth"
                    ? "Google access expired. Reconnect to keep syncing."
                    : `Last synced ${timeAgo(syncState.lastSyncAt)}.`}
                </p>
                {syncState.error && <p className="error">{syncState.error}</p>}
                <div className="button-row">
                  {syncState.status === "needs-auth" ? (
                    <button type="button" className="button button-ink" onClick={() => void connect()}>Reconnect</button>
                  ) : (
                    <button type="button" className="button button-ink" disabled={syncState.status === "syncing"} onClick={() => void sync()}>
                      {syncState.status === "syncing" ? "Syncing…" : "Sync now"}
                    </button>
                  )}
                  <button type="button" className="button button-quiet" onClick={() => void disconnect()}>Sign out</button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Sign in with the Google account you use in the FlickCue extension or the Android app. Your list is kept in a private
                  app folder in your own Google Drive. FlickCue can't see anything else in your Drive.
                </p>
                {syncState.error && <p className="error">{syncState.error}</p>}
                <button type="button" className="button button-ink" onClick={() => void connect()}>Sign in with Google</button>
              </>
            )}
          </article>

          <article className="card">
            <h2>Title details</h2>
            <form
              className="field-stack"
              onSubmit={(event) => {
                event.preventDefault();
                updateSettings({ tmdbKey: tmdbKey.trim(), region });
                toast("Saved");
              }}
            >
              <label>
                <span className="eyebrow">Streaming region</span>
                <select value={region} onChange={(event) => setRegion(event.target.value)}>
                  {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <span className="hint">Where-to-watch availability is shown for this country or region.</span>
              </label>
              <label>
                <span className="eyebrow">Your TMDB key (optional)</span>
                <input value={tmdbKey} onChange={(event) => setTmdbKey(event.target.value)} type="password" autoComplete="off" placeholder="v3 API key or v4 read token" />
                <span className="hint">
                  Leave it empty to use FlickCue's own title service. With a key, lookups go straight to TMDB. It's stored only in this browser and never synced.
                </span>
              </label>
              <button type="submit" className="button button-ink">Save</button>
            </form>
          </article>

          <article className="card">
            <h2>Reminders</h2>
            <p className="muted">
              Due titles are flagged in your queue. You can also get a browser notification when a reminder comes due while FlickCue is open in a tab.
            </p>
            <label className="switch">
              <input type="checkbox" checked={settings.notifications} onChange={(event) => void toggleNotifications(event.target.checked)} />
              <span>Notify me in this browser</span>
            </label>
          </article>

          <article className="card">
            <h2>Backup</h2>
            <p className="muted">
              {library.movies.length} titles. A backup is a JSON copy of your list. Importing one merges it into your list; nothing is overwritten.
            </p>
            <div className="button-row">
              <button type="button" className="button button-quiet" onClick={exportBackup}>Export backup</button>
              <button type="button" className="button button-quiet" onClick={() => fileInput.current?.click()}>Import backup</button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importBackup(file);
                  event.target.value = "";
                }}
              />
            </div>
          </article>

          <article className="card about">
            <h2>About</h2>
            <p className="muted">
              FlickCue for the web works with the <b>FlickCue browser extension</b> and the <b>FlickCue Android app</b>. All three share one list.
              There are no ads, no analytics and no account with the developer.
            </p>
            <img className="tmdb-logo" src="./tmdb-logo.svg" alt="TMDB" width={104} />
            <p className="muted small-print">{TMDB_ATTRIBUTION}</p>
          </article>
        </div>
      </section>
    </>
  );
}
