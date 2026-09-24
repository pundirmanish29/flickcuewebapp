// What buttons call: an editor change, committed, with a toast saying what
// happened (and Undo where a change is easy to regret).

import { toast } from "../components/Toast";
import * as editor from "./editor";
import { displayTitle, formatReminder } from "./rules";
import { commit, getState } from "./store";
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

export function setNote(id: string, note: string) {
  apply(editor.setNote(getState().library, id, note));
}

export function toggleEpisode(id: string, season: number, episode: number) {
  apply(editor.toggleEpisode(getState().library, id, season, episode));
}

export function toggleSeason(id: string, season: number, total: number) {
  apply(editor.toggleSeason(getState().library, id, season, total));
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
