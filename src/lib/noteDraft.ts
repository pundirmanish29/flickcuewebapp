/** A draft keeps the synced note it began from, so a blur cannot overwrite a remote edit. */
export interface NoteDraft {
  text: string;
  base: string;
  dirty: boolean;
  conflict: boolean;
}

export const noteDraft = (text: string): NoteDraft => ({ text, base: text, dirty: false, conflict: false });

export function editNoteDraft(draft: NoteDraft, text: string): NoteDraft {
  return { ...draft, text, dirty: text !== draft.base };
}

export function reconcileNoteDraft(draft: NoteDraft, remote: string): NoteDraft {
  if (!draft.dirty || draft.text === remote) return noteDraft(remote);
  return { ...draft, conflict: remote !== draft.base };
}

export function noteSavePlan(draft: NoteDraft, remote: string): "unchanged" | "save" | "conflict" {
  if (!draft.dirty || draft.text === remote) return "unchanged";
  return remote === draft.base ? "save" : "conflict";
}
