import { INDIAN_CITIES } from "../lib/cinemas";
import { LANGUAGES, REGIONS } from "../lib/regions";
import { chooseTheme, updateSettings, useAppState } from "../lib/store";
import { useTheme, type ThemeChoice } from "../lib/theme";
import { Icon } from "./Icon";

/** The whole row is the control: a tap on its label or gap opens the list, as a tap on the select itself does. */
function openList(event: React.MouseEvent<HTMLLabelElement>) {
  const select = event.currentTarget.querySelector("select");
  if (!select || event.target === select || (event.target as Element).closest("option")) return;
  event.preventDefault();
  try {
    select.showPicker();
  } catch {
    select.focus();
  }
}

const THEMES: [ThemeChoice, string][] = [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]];

/**
 * Theme, country (and city, where cities are listed) and title language for the
 * account menu, as one grouped list: each row's label on the left, its choice beside
 * it, and for the selects the whole row is the control. Country and city share a row
 * where both show, each with its label above its choice.
 */
export function AccountPrefs() {
  const { settings } = useAppState();
  const { choice } = useTheme();
  const listed = INDIAN_CITIES.some((city) => city.id === settings.city);
  return (
    <div className="am-prefs">
      <div className="am-row am-appearance">
        <span className="am-row-label">Appearance</span>
        <div className="am-seg" role="group" aria-label="Theme">
          {THEMES.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={choice === value} onClick={() => chooseTheme(value)}>{label}</button>
          ))}
        </div>
      </div>
      {settings.region === "IN" ? (
        // Where cities are listed, region and city share a row to save height.
        <div className="am-duo">
          <label className="am-row am-cell" onClick={openList}>
            <span className="am-row-label">Region</span>
            <select aria-label="Country" title="Streaming region" value={settings.region} onChange={(event) => updateSettings({ region: event.target.value })}>
              {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <Icon name="chevron" size={14} />
          </label>
          <label className="am-row am-cell" onClick={openList}>
            <span className="am-row-label">City</span>
            <select aria-label="City" title="Your city, for showtimes" value={listed ? settings.city : ""} onChange={(event) => updateSettings({ city: event.target.value })}>
              <option value="">{settings.city && !listed ? settings.city : "Choose a city"}</option>
              {INDIAN_CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
            <Icon name="chevron" size={14} />
          </label>
        </div>
      ) : (
        <label className="am-row" onClick={openList}>
          <span className="am-row-label">Region</span>
          <select aria-label="Country" title="Streaming region" value={settings.region} onChange={(event) => updateSettings({ region: event.target.value })}>
            {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <Icon name="chevron" size={14} />
        </label>
      )}
      <label className="am-row" onClick={openList}>
        <span className="am-row-label">Title language</span>
        <select aria-label="Title language" title="Title language: titles, overviews and taglines" value={settings.language ?? "en-US"} onChange={(event) => updateSettings({ language: event.target.value })}>
          {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <Icon name="chevron" size={14} />
      </label>
    </div>
  );
}
