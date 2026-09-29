// A title from Discover or search that isn't saved, open in the details
// sheet. Saved titles open by their #/title/<id> route instead; a preview
// has no id to route by, so it's held here while the sheet is open.

import { useSyncExternalStore } from "react";
import type { Candidate } from "./types";

let current: Candidate | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function openPreview(candidate: Candidate) {
  current = candidate;
  emit();
}

export function closePreview() {
  if (!current) return;
  current = null;
  emit();
}

export function usePreview(): Candidate | null {
  return useSyncExternalStore((listener) => (listeners.add(listener), () => listeners.delete(listener)), () => current);
}
