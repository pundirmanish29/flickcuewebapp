import { useEffect, useRef, useState } from "react";
import { timeAgo } from "../components/AccountMenu";
import { GoogleIcon, Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import * as actions from "../lib/actions";
import { toast } from "../components/Toast";
import { chooseTheme, confirmCalendarDeletes, confirmHeldRemoval, connect, disableCalendar, disconnect, enableCalendar, importLibrary, keepHeldTitles, reconnectCalendar, restoreVersion, retryCalendar, sync, updateSettings, useAppState } from "../lib/store";
import { getStoredToken } from "../lib/auth";
import { listRevisions, readRevision, type Revision } from "../lib/drive";
import { INDIAN_CITIES } from "../lib/cinemas";
import { CALENDAR_MIRROR_ENABLED, EXTENSION_URL, FIREFOX_EXTENSION_URL } from "../lib/config";
import { ContactReveal } from "../components/ContactReveal";
import { alertSupport } from "../lib/alerts";
import { letterboxdHandle, letterboxdProfileUrl, letterboxdStats } from "../lib/letterboxd";
import { useTheme, type ThemeChoice } from "../lib/theme";
import { LANGUAGES, REGIONS } from "../lib/regions";
import type { LibraryDocument } from "../lib/types";
import { backupPreview } from "../lib/backupPreview";

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

/** Drive keeps the list's earlier saves for about 30 days; any of them can be brought back. */
function RestoreHistory() {
  const { sync: syncState, library } = useAppState();
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ revision: Revision; document: LibraryDocument } | null>(null);
  if (!syncState.connected || !syncState.fileId) return null;

  const token = () => getStoredToken()?.accessToken;
  const load = async () => {
    setOpen(true);
    setError("");
    const accessToken = token();
    if (!accessToken) return setError("Resume sync first, then try again.");
    try {
      setRevisions((await listRevisions(syncState.fileId, accessToken)).slice(0, 12));
    } catch {
      setError("Couldn't load earlier versions from Drive.");
    }
  };
  const pick = async (revision: Revision) => {
    const accessToken = token();
    if (!accessToken) return setError("Resume sync first, then try again.");
    try {
      setPreview({ revision, document: await readRevision(syncState.fileId, revision.id, accessToken) });
    } catch {
      setError("Couldn't read that version.");
    }
  };
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const have = new Set(library.movies.map((movie) => movie.id));
  const missing = preview ? preview.document.movies.filter((movie) => !have.has(movie.id)).length : 0;

  if (!open) return <button type="button" className="inline-link restore-link" onClick={() => void load()}>Restore an earlier version…</button>;
  return (
    <div className="restore">
      <p className="field-label">Earlier versions in your Drive</p>
      {error && <p className="error">{error}</p>}
      {!revisions && !error && <p className="muted small-print">Loading…</p>}
      {revisions && !preview && (
        revisions.length ? (
          <ul className="restore-list">
            {revisions.map((revision) => (
              <li key={revision.id}><button type="button" className="restore-item" onClick={() => void pick(revision)}>{when(revision.modifiedTime)}</button></li>
            ))}
          </ul>
        ) : <p className="muted small-print">No earlier versions yet.</p>
      )}
      {preview && (
        <div className="restore-preview">
          <p>
            <b>{when(preview.revision.modifiedTime)}</b>: {preview.document.movies.length} titles
            {missing ? `, ${missing} of them not in your list now` : ", all still in your list"}.
            Restoring puts those titles back as they were then; anything added since stays.
          </p>
          <div className="button-row">
            <button type="button" className="button button-ink" onClick={() => { restoreVersion(preview.document); toast(`Restored the list from ${when(preview.revision.modifiedTime)}`); setOpen(false); setPreview(null); }}>Restore</button>
            <button type="button" className="button button-quiet" onClick={() => setPreview(null)}>Pick another</button>
          </div>
        </div>
      )}
      {!preview && <button type="button" className="inline-link" onClick={() => setOpen(false)}>Close</button>}
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
          {syncState.held ? (
            <div className="held-sync" role="alert">
              <p><b>Sync paused.</b> This device would remove {syncState.held} titles from your list on every device. If you didn't mean to, keep them.</p>
              <div className="button-row">
                <button type="button" className="button button-ink" onClick={() => keepHeldTitles()}>Keep the {syncState.held} titles</button>
                <button type="button" className="button button-quiet" onClick={() => confirmHeldRemoval()}>Remove them</button>
              </div>
            </div>
          ) : syncState.error && <p className="error">{syncState.error}</p>}
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
          <button type="button" className="button button-ink" onClick={() => void connect()}><GoogleIcon /> Sign in with Google</button>
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
      <p className="muted small-print">You can also switch it from your profile menu.</p>
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

/** Reminders mirrored into a calendar of their own in Google Calendar, so they alert with FlickCue closed. */
function GoogleCalendar() {
  const { settings, sync: syncState, calendar } = useAppState();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState("");
  if (!CALENDAR_MIRROR_ENABLED || !syncState.connected) return null;

  const on = Boolean(settings.calendarMirror);
  const count = calendar.mirrored.length;
  const turnOff = async () => {
    setBusy(true);
    const { removed } = await disableCalendar();
    setBusy(false);
    setConfirming(false);
    setLeft(removed ? "" : "Turned off. FlickCue couldn't reach Google to delete the calendar, so it's still in Google Calendar. You can delete it there.");
  };

  return (
    <article className="card" id="calendar">
      <h2>Google Calendar</h2>
      <label className="toggle">
        <span>
          <b>Add reminders to Google Calendar</b>
          <small>FlickCue keeps a calendar of its own for them, so your other events stay untouched. Google Calendar then alerts you at the reminder time, even when FlickCue is closed.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={busy}
          onChange={(event) => {
            setLeft("");
            if (event.target.checked) void enableCalendar();
            else setConfirming(true);
          }}
        />
      </label>

      {on && !confirming && (
        <div className="calendar-state" role="status">
          {calendar.status === "ok" ? (
            <p className="muted small-print">{count === 0 ? "Connected. Reminders you set will show up on it." : `${count} upcoming reminder${count === 1 ? "" : "s"} on your calendar.`}</p>
          ) : calendar.status === "syncing" ? (
            <p className="muted small-print">Updating your calendar…</p>
          ) : calendar.status === "pending" && !calendar.message ? (
            <p className="muted small-print">Waiting for your list to sync first.</p>
          ) : (
            <p className="note">{calendar.message}</p>
          )}
          {calendar.status === "pending" && calendar.message && <button type="button" className="button button-ink" onClick={() => void reconnectCalendar()}>Reconnect Google Calendar</button>}
          {calendar.status === "needs-permission" && <button type="button" className="button button-ink" onClick={() => void reconnectCalendar()}>Allow Google Calendar</button>}
          {calendar.status === "held" && <button type="button" className="button button-ink" onClick={() => void confirmCalendarDeletes()}>Remove them from the calendar</button>}
          {calendar.status === "error" && <button type="button" className="button button-ink" onClick={() => void retryCalendar()}>Try again</button>}
        </div>
      )}

      {confirming && (
        <div className="danger-zone">
          <p><b>Turn off and delete the FlickCue calendar?</b> Every reminder on it is removed from Google Calendar, and so is anything you added to it yourself. Your reminders in FlickCue stay as they are.</p>
          <div className="button-row">
            <button type="button" className="button button-danger" disabled={busy} onClick={() => void turnOff()}>{busy ? "Deleting…" : "Delete calendar and turn off"}</button>
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => setConfirming(false)}>Keep it on</button>
          </div>
        </div>
      )}

      {/* With the switch off, what is left to say: that Calendar wasn't allowed, a closed Google window, or a calendar left behind. */}
      {!on && (calendar.message || left) && <p className="note" role="status">{calendar.message || left}</p>}
      <p className="muted small-print">
        On a phone, make sure the FlickCue calendar is ticked in the Google Calendar app. Reminders changed in the extension or the Android app reach the calendar the next time you open FlickCue on the web.
      </p>
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
      <h2>Region, city &amp; language</h2>
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
        {/* Also in the profile menu; Settings holds every preference. */}
        <label>
          <span className="field-label">Title language</span>
          <select value={settings.language ?? "en-US"} onChange={(event) => updateSettings({ language: event.target.value })}>
            {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <span className="hint">The language of titles, overviews and taglines, where TMDB has it.</span>
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
              letterboxd.com/{settings.letterboxd}
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
  const [pending, setPending] = useState<LibraryDocument | null>(null);
  const preview = pending ? backupPreview(library, pending) : null;

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
      if (data.movies.some(movie => !movie || typeof movie.id !== "string" || typeof movie.title !== "string")) throw new Error("That backup contains invalid titles.");
      setPending({ movies: data.movies, deleted: Array.isArray(data.deleted) ? data.deleted : [] });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't read that file.");
    }
  };

  return (
    <article className="card">
      <h2>Backup</h2>
      <p className="muted">
        {library.movies.length === 1 ? "Your 1 title is" : `Your ${library.movies.length} titles are`} kept in your Google Drive. Download a copy any time. Restoring merges the backup with your list: newer edits win, and saved removals may remove titles. Changes sync to your other devices.
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
      {pending && preview && <div className="restore-preview" role="status">
        <p><b>Restore preview</b></p>
        <p>{preview.added} titles added · {preview.updated} updated · {preview.removed} removed.</p>
        <div className="button-row">
          <button type="button" className="button button-ink" onClick={() => { importLibrary(pending); setPending(null); toast("Backup merged with your list"); }}>Restore this backup</button>
          <button type="button" className="button button-quiet" onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div>}
      <RestoreHistory />
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
        <li><a href={EXTENSION_URL} target="_blank" rel="noreferrer">Chrome extension</a></li>
        <li><a href={FIREFOX_EXTENSION_URL} target="_blank" rel="noreferrer">Firefox add-on</a></li>
        <li><span className="muted">Android app · coming soon</span></li>
        <li><a href="./privacy.html">Privacy</a></li>
        <li><ContactReveal label="Contact support" /></li>
      </ul>
      <p className="tmdb-credit"><img src="./tmdb-logo.svg" alt="TMDB" width="140" height="12" /></p>
      <p className="muted small-print">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p>
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
          <GoogleCalendar />
          <RegionAndCity />
          <Letterboxd />
          <Backup />
          <About />
        </div>
      </section>
    </>
  );
}
