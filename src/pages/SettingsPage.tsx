import { useRef, useState } from "react";
import { timeAgo } from "../components/AccountMenu";
import { PageHeader } from "../components/PageHeader";
import { toast } from "../components/Toast";
import { connect, disconnect, importLibrary, sync, updateSettings, useAppState } from "../lib/store";
import { INDIAN_CITIES } from "../lib/cinemas";
import { letterboxdHandle, letterboxdProfileUrl, letterboxdStats } from "../lib/letterboxd";
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
  const [region, setRegion] = useState(settings.region);
  const [city, setCity] = useState(settings.city);
  // A place not in the list (or outside India) is typed instead of picked.
  const listed = INDIAN_CITIES.some((item) => item.id === city);
  const [typingCity, setTypingCity] = useState(Boolean(settings.city) && !INDIAN_CITIES.some((item) => item.id === settings.city));
  const [letterboxd, setLetterboxd] = useState(settings.letterboxd);
  const lbStats = letterboxdStats(library.movies);
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
      <PageHeader title="Settings" />

      <section className="paper settings-body">
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
                updateSettings({ region, city: city.trim() });
                toast("Saved");
              }}
            >
              <label>
                <span className="eyebrow">Streaming region</span>
                <select value={region} onChange={(event) => setRegion(event.target.value)}>
                  {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <span className="hint">Where-to-watch availability, and what's in cinemas, are shown for this country or region.</span>
              </label>
              <label>
                <span className="eyebrow">Your city</span>
                {region === "IN" && !typingCity ? (
                  <select
                    value={listed ? city : ""}
                    onChange={(event) => {
                      if (event.target.value === "other") {
                        setTypingCity(true);
                        setCity("");
                      } else setCity(event.target.value);
                    }}
                  >
                    <option value="">Not set</option>
                    {INDIAN_CITIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    <option value="other">Somewhere else…</option>
                  </select>
                ) : (
                  <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Your city" maxLength={60} autoComplete="address-level2" />
                )}
                <span className="hint">
                  For cinema showtimes. It stays on this device.
                  {typingCity && region === "IN" && (
                    <> <button type="button" className="inline-link" onClick={() => { setTypingCity(false); setCity(""); }}>Pick from the list</button></>
                  )}
                </span>
              </label>
              <button type="submit" className="button button-ink">Save</button>
            </form>
          </article>

          <article className="card" id="letterboxd">
            <h2>Letterboxd</h2>
            <p className="muted">
              Link your public Letterboxd profile to see it in your account menu. The link stays on this device; in Chrome and Edge it's
              picked up from the FlickCue extension when that signs you in.
              {lbStats.linked > 0 && ` ${lbStats.linked} titles in your list already carry Letterboxd ratings, likes or reviews, synced from the extension.`}
            </p>
            <form
              className="field-stack"
              onSubmit={(event) => {
                event.preventDefault();
                const handle = letterboxdHandle(letterboxd);
                if (letterboxd.trim() && !handle) return toast("That doesn't look like a Letterboxd username.");
                setLetterboxd(handle);
                updateSettings({ letterboxd: handle, letterboxdUnlinked: !handle });
                toast(handle ? `Linked letterboxd.com/${handle}` : "Letterboxd unlinked");
              }}
            >
              <label>
                <span className="eyebrow">Username or profile link</span>
                <input
                  value={letterboxd}
                  onChange={(event) => setLetterboxd(event.target.value)}
                  placeholder="letterboxd.com/yourname"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <div className="button-row">
                <button type="submit" className="button button-ink">{settings.letterboxd ? "Update" : "Link profile"}</button>
                {settings.letterboxd && (
                  <>
                    <a className="button button-quiet" href={letterboxdProfileUrl(settings.letterboxd)} target="_blank" rel="noreferrer">Open profile</a>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => {
                        setLetterboxd("");
                        updateSettings({ letterboxd: "", letterboxdUnlinked: true });
                        toast("Letterboxd unlinked");
                      }}
                    >
                      Unlink
                    </button>
                  </>
                )}
              </div>
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
          </article>
        </div>
      </section>
    </>
  );
}
