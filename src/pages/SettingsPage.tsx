import { useEffect, useRef, useState } from "react";
import { timeAgo } from "../components/AccountMenu";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import * as actions from "../lib/actions";
import { toast } from "../components/Toast";
import { chooseTheme, connect, disconnect, importLibrary, sync, updateSettings, useAppState } from "../lib/store";
import { INDIAN_CITIES } from "../lib/cinemas";
import { EXTENSION_URL } from "../lib/config";
import { alertSupport } from "../lib/alerts";
import { letterboxdHandle, letterboxdProfileUrl, letterboxdStats } from "../lib/letterboxd";
import { useTheme, type ThemeChoice } from "../lib/theme";
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

/** Removing every watched title, which syncs to every device: asked twice, with the number spelled out. */
function ClearWatched() {
  const { library } = useAppState();
  const [asking, setAsking] = useState(false);
  const count = library.movies.filter((movie) => movie.watched).length;
  if (!count) return null;
  return (
    <div className="danger-zone">
      {asking ? (
        <>
          <p><b>Remove all {count} watched titles?</b> They'll be removed from your list on every device. Export a backup first if you might want them back.</p>
          <div className="button-row">
            <button type="button" className="button button-danger" onClick={() => { actions.clearWatched(); setAsking(false); }}>Remove {count} titles</button>
            <button type="button" className="button button-quiet" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <button type="button" className="link-button danger-link" onClick={() => setAsking(true)}>Clear watched history…</button>
      )}
    </div>
  );
}

function Account() {
  const { sync: syncState } = useAppState();
  return (
    <article className="card">
      <h2>Account</h2>
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
              ? "Sync paused. Your changes are saved on this device and sync when you resume."
              : `Your list and settings sync through your Google Drive. Last synced ${timeAgo(syncState.lastSyncAt)}.`}
          </p>
          {syncState.error && <p className="error">{syncState.error}</p>}
          <div className="button-row">
            {syncState.status === "needs-auth" ? (
              <button type="button" className="button button-ink" onClick={() => void connect()}>Resume sync</button>
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
  );
}

function Appearance() {
  const { choice } = useTheme();
  const options: [ThemeChoice, string][] = [["system", "Match device"], ["light", "Light"], ["dark", "Dark"]];
  return (
    <article className="card">
      <h2>Appearance</h2>
      <div className="segmented" role="group" aria-label="Theme">
        {options.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={choice === value} onClick={() => chooseTheme(value)}>{label}</button>
        ))}
      </div>
      <p className="muted small-print">The sun and moon in the top bar switch it too.</p>
    </article>
  );
}

function Notifications() {
  const { settings } = useAppState();
  const support = alertSupport();
  const supported = support === "supported";
  const [permission, setPermission] = useState(() => (supported ? Notification.permission : "default"));

  const toggle = async (enabled: boolean) => {
    if (enabled && supported && Notification.permission !== "granted") {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== "granted") return;
    }
    updateSettings({ notifications: enabled });
  };

  const on = supported && settings.notifications && permission === "granted";
  return (
    <article className="card" id="notifications">
      <h2>Notifications</h2>
      <label className={`toggle ${!supported ? "disabled" : ""}`}>
        <span>
          <b>Alerts on this device</b>
          <small>When a reminder is due, or a show you're watching has a new episode today.</small>
        </span>
        <input type="checkbox" role="switch" checked={on} disabled={!supported} onChange={(event) => void toggle(event.target.checked)} />
      </label>
      {support === "home-screen" ? (
        <p className="note">
          On iPhone and iPad, alerts need FlickCue on your Home Screen: tap <Icon name="external" size={13} /> Share, then <b>Add to Home Screen</b>, and open it from there.
        </p>
      ) : !supported ? (
        <p className="note">This browser can't show alerts from websites.</p>
      ) : permission === "denied" ? (
        <p className="note">Alerts are blocked for this site. Allow them in your browser's site settings, then turn this on.</p>
      ) : (
        <p className="muted small-print">Set on each device, and shown while FlickCue is open.</p>
      )}
    </article>
  );
}

function RegionAndCity() {
  const { settings } = useAppState();
  const [cityText, setCityText] = useState(settings.city);
  const listed = INDIAN_CITIES.some((item) => item.id === settings.city);
  const [typingCity, setTypingCity] = useState(Boolean(settings.city) && !listed);
  // Settings can change from another device: keep the typed field in step.
  useEffect(() => setCityText(settings.city), [settings.city]);

  return (
    <article className="card">
      <h2>Region &amp; city</h2>
      <div className="field-stack">
        <label>
          <span className="field-label">Streaming region</span>
          <select value={settings.region} onChange={(event) => updateSettings({ region: event.target.value })}>
            {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <span className="hint">Where to watch, and what's in cinemas, for this country.</span>
        </label>
        <label>
          <span className="field-label">Your city</span>
          {settings.region === "IN" && !typingCity ? (
            <select
              value={listed ? settings.city : ""}
              onChange={(event) => {
                if (event.target.value === "other") {
                  setTypingCity(true);
                  updateSettings({ city: "" });
                } else updateSettings({ city: event.target.value });
              }}
            >
              <option value="">Not set</option>
              {INDIAN_CITIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              <option value="other">Somewhere else…</option>
            </select>
          ) : (
            <input
              value={cityText}
              onChange={(event) => setCityText(event.target.value)}
              onBlur={() => updateSettings({ city: cityText.trim() })}
              onKeyDown={(event) => event.key === "Enter" && (event.currentTarget as HTMLInputElement).blur()}
              placeholder="Your city"
              maxLength={60}
              autoComplete="address-level2"
            />
          )}
          <span className="hint">
            For cinema showtimes.
            {typingCity && settings.region === "IN" && (
              <> <button type="button" className="inline-link" onClick={() => { setTypingCity(false); updateSettings({ city: "" }); }}>Pick from the list</button></>
            )}
          </span>
        </label>
      </div>
    </article>
  );
}

function Letterboxd() {
  const { settings, library } = useAppState();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(settings.letterboxd);
  const stats = letterboxdStats(library.movies);
  const linked = settings.letterboxd && !editing;

  const save = () => {
    const handle = letterboxdHandle(value);
    if (value.trim() && !handle) return toast("That doesn't look like a Letterboxd username.");
    updateSettings({ letterboxd: handle, letterboxdUnlinked: !handle });
    setEditing(false);
    toast(handle ? `Linked letterboxd.com/${handle}` : "Letterboxd unlinked");
  };

  return (
    <article className="card" id="letterboxd">
      <h2>Letterboxd</h2>
      {linked ? (
        <>
          <p className="linked-row">
            <a href={letterboxdProfileUrl(settings.letterboxd)} target="_blank" rel="noreferrer">
              letterboxd.com/{settings.letterboxd} <Icon name="external" size={13} />
            </a>
          </p>
          <p className="linked-actions">
            <button type="button" className="inline-link" onClick={() => { setValue(settings.letterboxd); setEditing(true); }}>Change</button>
            <span aria-hidden="true"> · </span>
            <button type="button" className="inline-link" onClick={() => { setValue(""); updateSettings({ letterboxd: "", letterboxdUnlinked: true }); toast("Letterboxd unlinked"); }}>Unlink</button>
          </p>
        </>
      ) : (
        <form className="field-stack" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <p className="muted">Show your Letterboxd profile in your account menu.</p>
          <label>
            <span className="field-label">Username or profile link</span>
            <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="letterboxd.com/yourname" autoComplete="off" autoCapitalize="none" spellCheck={false} />
          </label>
          <div className="button-row">
            <button type="submit" className="button button-ink">{settings.letterboxd ? "Save" : "Link profile"}</button>
            {editing && <button type="button" className="button button-quiet" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}
      {stats.linked > 0 && <p className="muted small-print">{stats.linked} titles in your list carry Letterboxd ratings, likes or reviews.</p>}
    </article>
  );
}

function Backup() {
  const { library } = useAppState();
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

  return (
    <article className="card">
      <h2>Backup</h2>
      <p className="muted">
        {library.movies.length === 1 ? "Your 1 title is" : `Your ${library.movies.length} titles are`} kept in your Google Drive. Download a copy any time; restoring one adds back anything missing and changes nothing else.
      </p>
      <div className="button-row">
        <button type="button" className="button button-quiet" onClick={exportBackup}>Download a copy</button>
        <button type="button" className="button button-quiet" onClick={() => fileInput.current?.click()}>Restore from a copy</button>
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
      <ClearWatched />
    </article>
  );
}

function About() {
  return (
    <article className="card about">
      <h2>About</h2>
      <p className="muted">
        FlickCue for the web shares one list with the FlickCue browser extension and the Android app. No ads, no analytics, and no account with the developer.
      </p>
      <ul className="about-links">
        <li><a href={EXTENSION_URL} target="_blank" rel="noreferrer">Chrome extension <Icon name="external" size={13} /></a></li>
        <li><span className="muted">Android app · coming soon</span></li>
        <li><a href="./privacy.html">Privacy</a></li>
      </ul>
      <p className="muted small-print">Version {__APP_VERSION__}</p>
    </article>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <section className="paper settings-body">
        <div className="wrap settings">
          <Account />
          <Appearance />
          <Notifications />
          <RegionAndCity />
          <Letterboxd />
          <Backup />
          <About />
        </div>
      </section>
    </>
  );
}
