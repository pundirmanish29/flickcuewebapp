import { useCallback, useEffect, useRef, useState } from "react";
import { INDIAN_CITIES } from "../lib/cinemas";
import { LANGUAGES, REGIONS } from "../lib/regions";
import { updateSettings, useAppState } from "../lib/store";
import { Icon } from "./Icon";
import { Popover } from "./ReminderMenu";

/** A header button that opens a small settings popover, closing on any page change. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, [open, close]);
  return { open, close, toggle: () => setOpen((value) => !value), trigger };
}

/** Streaming region and city, without a trip to Settings. */
export function LocationMenu() {
  const { settings } = useAppState();
  const menu = useMenu();
  const country = REGIONS.find(([code]) => code === settings.region)?.[1] ?? settings.region;
  const listed = INDIAN_CITIES.some((city) => city.id === settings.city);
  return (
    <div className="header-menu">
      <button
        ref={menu.trigger}
        type="button"
        className="header-icon"
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-label={`Location: ${country}`}
        title={`Location: ${country}`}
        onClick={menu.toggle}
      >
        <Icon name="pin" size={20} />
      </button>
      <Popover open={menu.open} onClose={menu.close} label="Location" anchor={menu.trigger}>
        <div className="field-stack header-prefs">
          <label>
            <span className="field-label">Streaming region</span>
            <select value={settings.region} onChange={(event) => updateSettings({ region: event.target.value })}>
              {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          {settings.region === "IN" && (
            <label>
              <span className="field-label">Your city</span>
              <select value={listed ? settings.city : ""} onChange={(event) => updateSettings({ city: event.target.value })}>
                <option value="">{settings.city && !listed ? settings.city : "Choose a city"}</option>
                {INDIAN_CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
              </select>
            </label>
          )}
          <p className="hint">Where to watch, what's in cinemas, and which day an episode reaches you.</p>
        </div>
      </Popover>
    </div>
  );
}

/** The language titles, overviews and taglines come in. */
export function LanguageMenu() {
  const { settings } = useAppState();
  const menu = useMenu();
  const current = settings.language ?? "en-US";
  const name = LANGUAGES.find(([code]) => code === current)?.[1] ?? current;
  return (
    <div className="header-menu">
      <button
        ref={menu.trigger}
        type="button"
        className="header-icon"
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-label={`Title language: ${name}`}
        title={`Title language: ${name}`}
        onClick={menu.toggle}
      >
        <Icon name="globe" size={20} />
      </button>
      <Popover open={menu.open} onClose={menu.close} label="Title language" anchor={menu.trigger}>
        <div className="field-stack header-prefs">
          <label>
            <span className="field-label">Title language</span>
            <select value={current} onChange={(event) => updateSettings({ language: event.target.value })}>
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <p className="hint">Titles, overviews and taglines from TMDB. Reopen a title to see it in the new language.</p>
        </div>
      </Popover>
    </div>
  );
}
