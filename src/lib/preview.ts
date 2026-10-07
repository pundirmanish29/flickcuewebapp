// A title from Discover or search that isn't saved. It opens at its own
// address (#/title/tmdb:<type>:<id>, see titleRoute.ts); the result it was
// opened from is held here so the page shows it at once, without asking TMDB
// again. A link opened cold fetches the title instead.

import { useSyncExternalStore } from "react";
import { goToTitle } from "./titleRoute";
import type { Candidate } from "./types";

let current: Candidate | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function openPreview(candidate: Candidate) {
  current = candidate;
  emit();
  goToTitle(candidate.key);
}

export function closePreview() {
  if (!current) return;
  current = null;
  emit();
}

export function usePreview(): Candidate | null {
  return useSyncExternalStore((listener) => (listeners.add(listener), () => listeners.delete(listener)), () => current);
}
