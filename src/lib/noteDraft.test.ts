import { describe, expect, it } from "vitest";
import { editNoteDraft, noteDraft, noteSavePlan, reconcileNoteDraft } from "./noteDraft";

describe("notes edited while another client syncs", () => {
  it("shows the newly synced text when the note is idle, without writing the old text on blur", () => {
    const before = noteDraft("Old note");
    expect(noteSavePlan(before, "Extension note")).toBe("unchanged");
    expect(reconcileNoteDraft(before, "Extension note")).toEqual(noteDraft("Extension note"));
  });

  it("preserves typing and requires an explicit choice when the same note changed remotely", () => {
    const typing = editNoteDraft(noteDraft("Original"), "My draft");
    const conflicted = reconcileNoteDraft(typing, "Extension edit");
    expect(conflicted).toMatchObject({ text: "My draft", base: "Original", dirty: true, conflict: true });
    expect(noteSavePlan(conflicted, "Extension edit")).toBe("conflict");
  });

  it("saves a dirty draft when unrelated synced fields changed, leaving their record intact", () => {
    expect(noteSavePlan(editNoteDraft(noteDraft("Original"), "My draft"), "Original")).toBe("save");
  });

  it("does not treat the same edit arriving from another device as a conflict", () => {
    const typing = editNoteDraft(noteDraft("Original"), "Same edit");
    expect(reconcileNoteDraft(typing, "Same edit")).toEqual(noteDraft("Same edit"));
    expect(noteSavePlan(typing, "Same edit")).toBe("unchanged");
  });
});
