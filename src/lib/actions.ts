// What buttons call: an editor change, committed, with a toast saying what
// happened (and Undo where a change is easy to regret).

import { toast } from "../components/Toast";
import * as editor from "./editor";
import { displayTitle, formatReminder } from "./rules";
import { allowBulkRemoval, commit, getState } from "./store";
import type { Candidate, LibraryDocument } from "./types";

function apply(result: editor.EditResult, message?: (title: string) => string, undo?: (before: LibraryDocument) => void) {
  if (!result.ok) {
    if (result.reason !== "Unchanged.") toast(result.reason);
    return false;
  }
  const before = getState().library;
  commit(result.document);
  if (message) toast(message(displayTitle(result.movie)), undo ? { label: "Undo", run: () => undo(before) } : undefined);
  return true;
}

export function toggleWatched(id: string) {
  const movie = getState().library.movies.find((item) => item.id === id);
  if (!movie) return;
  const watched = !movie.watched;
  apply(
    editor.setWatched(getState().library, id, watched),
    (title) => (watched ? `Marked ${title} watched` : `${title} is back in your queue`),
    () => apply(editor.setWatched(getState().library, id, !watched))
  );
}

export function setWatching(id: string, watching: boolean) {
  apply(
    editor.setWatching(getState().library, id, watching),
    (title) => (watching ? `Watching ${title}` : `Stopped watching ${title}`),
    (before) => commit(before)
  );
}

export function remindAt(id: string, at: number) {
  apply(editor.setReminder(getState().library, id, at), (title) => `${title}: reminder ${formatReminder(at)}`);
}

export function clearReminder(id: string) {
  apply(editor.clearReminder(getState().library, id), (title) => `Reminder cleared for ${title}`);
}

export function snooze(id: string) {
  const result = editor.snooze(getState().library, id);
  apply(result, (title) => `${title}: reminder ${result.ok ? formatReminder(Number(result.movie.remindAt)) : ""}`);
}

export function setInterested(id: string, interested: boolean) {
  apply(editor.setInterested(getState().library, id, interested), (title) =>
    interested ? `Keeping an eye on ${title}` : `Stopped watching for ${title}`);
}

export function dismissWatchedPrompt(id: string) {
  apply(editor.dismissWatchedPrompt(getState().library, id), (title) => `OK, ${title} stays in your queue`);
}

export function setTake(id: string, take: { rating?: number; liked?: boolean }) {
  apply(editor.setTake(getState().library, id, take));
}

export function setReview(id: string, review: string) {
  apply(editor.setReview(getState().library, id, review));
}

/** Saves a title and marks it watched in one go, from a title not yet in the list. */
export function saveWatched(candidate: Candidate) {
  const added = editor.addFromCandidate(getState().library, candidate, null);
  if (!added.ok) return toast(added.reason);
  const watched = editor.setWatched(added.document, added.movie.id, true);
  if (!watched.ok) return toast(watched.reason);
  commit(watched.document);
  toast(`Marked ${displayTitle(watched.movie)} watched`);
}

/** Saves a show as one you're watching. */
export function saveWatching(candidate: Candidate) {
  const added = editor.addFromCandidate(getState().library, candidate, null);
  if (!added.ok) return toast(added.reason);
  const watching = editor.setWatching(added.document, added.movie.id, true);
  commit(watching.ok ? watching.document : added.document);
  toast(`Watching ${displayTitle(added.movie)}`);
}

export function setNote(id: string, note: string) {
  apply(editor.setNote(getState().library, id, note));
}

/** An episode or season tick; the one that completes an ended show also moves it to Watched, and Undo takes back both. */
function tick(result: editor.EditResult, id: string) {
  const finished = result.ok ? editor.finishIfComplete(result.document, id) : null;
  if (!finished?.ok) return apply(result);
  apply(finished, (title) => `That's every episode of ${title}. Moved to Watched`, (before) => commit(before));
}

export function toggleEpisode(id: string, season: number, episode: number) {
  tick(editor.toggleEpisode(getState().library, id, season, episode), id);
}

export function toggleSeason(id: string, season: number, total: number, only?: number[]) {
  tick(editor.toggleSeason(getState().library, id, season, total, Date.now(), only), id);
}

/** A show whose episodes were all ticked before this existed (or in another app): moved to Watched when opened. */
export function finishIfComplete(id: string) {
  apply(editor.finishIfComplete(getState().library, id), (title) => `That's every episode of ${title}. Moved to Watched`, (before) => commit(before));
}

export function removeTitle(id: string) {
  const result = editor.remove(getState().library, id);
  if (!result.ok) return toast(result.reason);
  commit(result.document);
  const backup = result.movie;
  toast(`Removed ${displayTitle(backup)}`, {
    label: "Undo",
    run: () => apply(editor.restore(getState().library, backup), (title) => `${title} is back`)
  });
}

export function addCandidate(candidate: Candidate, remind: number | null = null) {
  return apply(
    editor.addFromCandidate(getState().library, candidate, remind),
    (title) => (remind ? `Saved ${title}, reminder ${formatReminder(remind)}` : `Saved ${title}`),
    () => {
      const saved = editor.findExisting(getState().library, candidate);
      if (saved) apply(editor.remove(getState().library, saved.id));
    }
  );
}

export function addManual(title: string, year: string, mediaType: string, remind: number | null) {
  return apply(editor.addManual(getState().library, title, year, mediaType, remind), (name) => `Saved ${name}`);
}

export function clearWatched() {
  const before = getState().library;
  const { document, removed } = editor.clearWatched(before);
  if (!removed.length) return toast("Nothing watched to clear.");
  // Confirmed in Settings, so the sync guard lets it through.
  allowBulkRemoval();
  commit(document);
  toast(`Cleared ${removed.length} watched title${removed.length === 1 ? "" : "s"}`, {
    label: "Undo",
    run: () => {
      let library = getState().library;
      for (const movie of removed) {
        const restored = editor.restore(library, movie);
        if (restored.ok) library = restored.document;
      }
      commit(library);
    }
  });
}
