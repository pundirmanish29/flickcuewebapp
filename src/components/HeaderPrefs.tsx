import { INDIAN_CITIES } from "../lib/cinemas";
import { LANGUAGES, REGIONS } from "../lib/regions";
import { updateSettings, useAppState } from "../lib/store";
import { Icon } from "./Icon";

/**
 * Location (country, and city where cities are listed) and title language for
 * the account menu: the location is one control, the language the next.
 */
export function AccountPrefs() {
  const { settings } = useAppState();
  const listed = INDIAN_CITIES.some((city) => city.id === settings.city);
  return (
    <div className="account-prefs">
      <div className="account-pref">
        <Icon name="pin" size={15} />
        <select aria-label="Country" title="Streaming region" value={settings.region} onChange={(event) => updateSettings({ region: event.target.value })}>
          {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        {settings.region === "IN" && (
          <>
            <span className="account-pref-divider" aria-hidden="true" />
            <select aria-label="City" title="Your city, for showtimes" value={listed ? settings.city : ""} onChange={(event) => updateSettings({ city: event.target.value })}>
              <option value="">{settings.city && !listed ? settings.city : "City"}</option>
              {INDIAN_CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
          </>
        )}
      </div>
      <div className="account-pref">
        <Icon name="globe" size={15} />
        <select aria-label="Title language" title="Title language: titles, overviews and taglines" value={settings.language ?? "en-US"} onChange={(event) => updateSettings({ language: event.target.value })}>
          {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>
    </div>
  );
}
