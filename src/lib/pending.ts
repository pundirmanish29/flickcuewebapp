// What a paused sync puts at risk, so the page only raises its voice when it matters.
// Google's sign-in lasts about an hour and only the person can renew it, so a pause is routine:
// a banner for every one of them is noise, but edits waiting to leave this device, or a list that
// hasn't been in step for a long while, deserve the nudge.

import type { LibraryDocument } from "./types";

/** How long a list may go without a sync before a pause is worth a banner even with nothing to send. */
export const STALE_AFTER = 6 * 60 * 60 * 1000;

/** Edits made here since the last sync: titles changed or removed, and a synced setting changed. */
export function pendingChanges(library: LibraryDocument, settingsUpdatedAt: number, lastSyncAt: number): number {
  let count = 0;
  for (const movie of library.movies ?? []) {
    if ((Number(movie.updatedAt ?? movie.createdAt) || 0) > lastSyncAt) count++;
  }
  for (const entry of library.deleted ?? []) {
    if ((Number(entry.deletedAt) || 0) > lastSyncAt) count++;
  }
  if ((Number(settingsUpdatedAt) || 0) > lastSyncAt) count++;
  return count;
}

export type PauseNotice = { show: false } | { show: true; reason: "pending" | "stale"; pending: number };

/** Whether a paused sync gets the banner: edits waiting, never synced here, or not in step for a long while. */
export function pauseNotice(pending: number, lastSyncAt: number, now: number): PauseNotice {
  if (pending > 0) return { show: true, reason: "pending", pending };
  if (!lastSyncAt || now - lastSyncAt > STALE_AFTER) return { show: true, reason: "stale", pending: 0 };
  return { show: false };
}
