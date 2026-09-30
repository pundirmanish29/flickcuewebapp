// Light or dark: the device's choice unless the reader picks one here. The
// pick is this browser's own (a per-device preference, not synced), and is
// applied as <html data-theme> before the page paints (see index.html).

import { useSyncExternalStore } from "react";
import { transition } from "./motion";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "flickcue.theme";
const EVENT = "flickcue:theme";
const darkQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function getThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** What the page actually shows right now. */
export function resolvedTheme(choice = getThemeChoice()): "light" | "dark" {
  if (choice !== "system") return choice;
  return darkQuery?.matches ? "dark" : "light";
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Without storage the choice lasts for this page only.
  }
  // The page cross-fades to the other theme rather than flipping in a frame.
  transition(() => {
    if (choice === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
  });
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  darkQuery?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    darkQuery?.removeEventListener("change", onChange);
  };
}

/** The reader's choice and the theme it comes to, kept current. */
export function useTheme(): { choice: ThemeChoice; theme: "light" | "dark" } {
  const choice = useSyncExternalStore(subscribe, getThemeChoice, () => "system" as ThemeChoice);
  const theme = useSyncExternalStore(subscribe, () => resolvedTheme(), () => "light" as const);
  return { choice, theme };
}
