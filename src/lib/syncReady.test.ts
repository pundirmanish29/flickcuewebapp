import { describe, expect, it } from "vitest";
import { syncReady } from "./syncReady";

describe("metadata write readiness", () => {
  const state = { connected: true, status: "idle", lastSyncAt: 200 };
  it("rejects a cached previous visit's sync even though the account is connected", () => {
    expect(syncReady(state, 201)).toBe(false);
    expect(syncReady(state, 200)).toBe(true);
  });
  it("stops writes while signed out, syncing, paused or held", () => {
    for (const patch of [{ connected: false }, { status: "syncing" }, { status: "needs-auth" }, { held: 1 }]) {
      expect(syncReady({ ...state, ...patch }, 100)).toBe(false);
    }
  });
});
