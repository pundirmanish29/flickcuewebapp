import { afterEach, describe, expect, it, vi } from "vitest";
import { letterboxdAvatar, letterboxdSyncState, readLetterboxdStatus, requestLetterboxdStatus, requestLetterboxdSync, type LetterboxdConnection } from "./letterboxdConnection";
import { EXTENSION_IDS } from "./config";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const NOW = 1_800_000_000_000;
const own = {
  username: "filmfan", displayName: "Film Fan", avatarUrl: "https://a.ltrbxd.com/resized/avatar/upload/filmfan.jpg",
  scope: { watched: true, diary: true, ratings: true, reviews: false, watchlist: false },
  syncedAt: NOW - 60_000, lastError: "", counts: { films: 12, watchlist: 9 }, progress: null
} satisfies LetterboxdConnection;
const reply = (profile: unknown = own) => ({ ok: true, signedIn: true, accountEmail: "me@example.com", profile });

describe("Letterboxd extension status", () => {
  it("keeps the actual picture, selected import categories and last sync for the matching account", () => {
    expect(readLetterboxdStatus(reply(), " ME@example.com ", "filmfan").profile).toEqual(own);
  });
  it("does not show another account's or another profile's status", () => {
    expect(readLetterboxdStatus(reply(), "other@example.com", "filmfan")).toEqual({ profile: null, reason: "other-account" });
    expect(readLetterboxdStatus(reply(), "", "filmfan").profile).toBeNull();
    expect(readLetterboxdStatus(reply(), "me@example.com", "someone_else")).toEqual({ profile: null, reason: "profile-mismatch" });
  });
  it("distinguishes missing extension, signed out, and no configured own profile", () => {
    expect(readLetterboxdStatus(null, "me@example.com", "filmfan").reason).toBe("unavailable");
    expect(readLetterboxdStatus({ ok: true, signedIn: false }, "me@example.com", "filmfan").reason).toBe("signed-out");
    expect(readLetterboxdStatus(reply(null), "me@example.com", "filmfan").reason).toBe("not-configured");
  });
  it("only enables explicit boolean scopes and rejects bad timestamps and counts", () => {
    const result = readLetterboxdStatus(reply({ ...own, scope: { watched: "true", reviews: true }, syncedAt: -1, counts: { films: Infinity, watchlist: "20" } }), "me@example.com", "filmfan").profile!;
    expect(result.scope).toEqual({ watched: false, diary: false, ratings: false, reviews: true, watchlist: false });
    expect(result.syncedAt).toBe(0);
    expect(result.counts).toEqual({ films: 0 });
  });
  it("loads pictures only from Letterboxd image hosts", () => {
    expect(letterboxdAvatar(own.avatarUrl)).toBe(own.avatarUrl);
    for (const value of ["javascript:alert(1)", "http://a.ltrbxd.com/a.jpg", "https://a.ltrbxd.com.evil.test/a.jpg", "https://a.ltrbxd.com@evil.test/a.jpg", "https://a.ltrbxd.com:444/a.jpg"]) expect(letterboxdAvatar(value)).toBe("");
  });
  it("shows current progress, abandoned runs, errors and a first sync separately", () => {
    expect(letterboxdSyncState(own, NOW)).toBe("Synced");
    expect(letterboxdSyncState({ ...own, syncedAt: 0 }, NOW)).toBe("Waiting for first sync");
    expect(letterboxdSyncState({ ...own, lastError: "Offline" }, NOW)).toBe("Needs attention");
    const running = { ...own, progress: { active: true, startedAt: NOW - 59_000, processed: 2, total: 20 } };
    expect(letterboxdSyncState(running, NOW)).toBe("Syncing");
    expect(letterboxdSyncState({ ...running, progress: { ...running.progress, startedAt: NOW - 600_000 } }, NOW)).toBe("Interrupted");
    expect(letterboxdSyncState({ ...running, progress: { ...running.progress, startedAt: NOW + 1000 } }, NOW)).toBe("Interrupted");
  });
  it("uses only the read-only status message, trying the unpacked extension if needed", async () => {
    const sendMessage = vi.fn((id, _message, callback) => callback(id === EXTENSION_IDS[0] ? null : reply()));
    vi.stubGlobal("window", { chrome: { runtime: { sendMessage } } });
    await expect(requestLetterboxdStatus("me@example.com", "filmfan")).resolves.toEqual({ profile: own });
    expect(sendMessage.mock.calls.map(call => call[1])).toEqual(EXTENSION_IDS.map(() => ({ type: "FLICKCUE_WEB_LETTERBOXD_STATUS" })));
  });
  it("handles absent and non-answering extensions without hanging", async () => {
    vi.stubGlobal("window", {});
    expect((await requestLetterboxdStatus("me@example.com", "filmfan")).reason).toBe("unavailable");
    vi.useFakeTimers();
    vi.stubGlobal("window", { chrome: { runtime: { sendMessage: () => {} } } });
    const pending = requestLetterboxdStatus("me@example.com", "filmfan");
    await vi.runAllTimersAsync();
    expect((await pending).reason).toBe("unavailable");
  });
  it("starts an import in only the extension with the matching account and profile", async () => {
    const sendMessage = vi.fn((id, message, callback) => callback(id === EXTENSION_IDS[0] ? reply({ ...own, username: "someone_else" }) : message.type === "FLICKCUE_WEB_LETTERBOXD_STATUS" ? reply() : { ...reply(), accepted: true }));
    vi.stubGlobal("window", { chrome: { runtime: { sendMessage } } });
    await expect(requestLetterboxdSync("me@example.com", "filmfan")).resolves.toEqual({ ok: true, profile: own });
    expect(sendMessage.mock.calls.filter(call => call[1].type === "FLICKCUE_WEB_LETTERBOXD_SYNC").map(call => [call[0], call[1]])).toEqual([[EXTENSION_IDS[1], { type: "FLICKCUE_WEB_LETTERBOXD_SYNC", accountEmail: "me@example.com", username: "filmfan", enable: false }]]);
  });
  it("requires an explicit enable action for a profile not yet configured", async () => {
    const sendMessage = vi.fn((_id, message, callback) => callback(message.type === "FLICKCUE_WEB_LETTERBOXD_STATUS" ? reply(null) : { ...reply(), accepted: true }));
    vi.stubGlobal("window", { chrome: { runtime: { sendMessage } } });
    expect((await requestLetterboxdSync("me@example.com", "filmfan", true)).ok).toBe(true);
    expect(sendMessage.mock.calls[1][1].enable).toBe(true);
  });
  it("never retries a timed-out write in another installed extension", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn((_id, message, callback) => { if (message.type === "FLICKCUE_WEB_LETTERBOXD_STATUS") callback(reply()); });
    vi.stubGlobal("window", { chrome: { runtime: { sendMessage } } });
    const pending = requestLetterboxdSync("me@example.com", "filmfan");
    await vi.runAllTimersAsync();
    expect((await pending).ok).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
  it("doesn't send import commands to another Google account", async () => {
    const sendMessage = vi.fn((_id, _message, callback) => callback(reply()));
    vi.stubGlobal("window", { chrome: { runtime: { sendMessage } } });
    expect((await requestLetterboxdSync("other@example.com", "filmfan")).ok).toBe(false);
    expect(sendMessage.mock.calls.every(call => call[1].type === "FLICKCUE_WEB_LETTERBOXD_STATUS")).toBe(true);
  });
});
