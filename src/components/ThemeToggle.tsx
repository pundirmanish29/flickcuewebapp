import { setThemeChoice, useTheme } from "../lib/theme";
import { Icon } from "./Icon";

/** The header's day/night switch: shows the theme a tap switches to. */
export function ThemeToggle() {
  const { theme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Switch to dark theme" : "Switch to light theme";
  return (
    <button type="button" className="header-icon theme-toggle" aria-label={label} title={label} onClick={() => setThemeChoice(next)}>
      <Icon name={next === "dark" ? "moon" : "sun"} size={20} />
    </button>
  );
}
