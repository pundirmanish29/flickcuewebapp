import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryDocument } from "./types";

const auth = vi.hoisted(() => ({ token: null as any, offered: null as any, extension: null as any }));
vi.mock("./auth", () => ({
  canAskExtension: () => false,
  getCalendarToken: () => null,
  getStoredToken: () => auth.token,
  forgetToken: () => { auth.token = null; },
  grantsCalendar: () => false,
  requestExtensionSession: async () => auth.extension,
  requestToken: vi.fn(async () => auth.offered),
  revokeToken: async () => { auth.token = null; },
  storeCalendarToken: vi.fn(),
  storeToken: (token: unknown) => { auth.token = token; }
}));
vi.mock("./config", () => ({ CALENDAR_MIRROR_ENABLED: false, LONG_SIGNIN_ENABLED: false }));
vi.mock("./longSignin", () => ({ getGrant: () => null, renewAccess: vi.fn(), revokeGrant: vi.fn(), signInForLong: vi.fn(), acceptLongSignIn: vi.fn() }));
vi.mock("./calendarMirror", () => ({ createCalendarMirror: () => ({ restore: vi.fn(), schedule: vi.fn(), reset: vi.fn() }) }));
vi.mock("./ticketCache", () => ({ cacheTicket: vi.fn(), cachedTicket: vi.fn(), forgetAllTickets: vi.fn(), forgetTicket: vi.fn() }));
vi.mock("./theme", () => ({ getThemeChoice: () => "system", setThemeChoice: vi.fn() }));
vi.mock("./tmdb", () => ({ setContentLanguage: vi.fn() }));

const NOW = 1_800_000_000_000;
const account = (email = "a@example.test") => ({ email, name: "Account A", photo: "" });
const initial = () => ({ id: "one", title: "First title", createdAt: NOW - 5000, updatedAt: NOW - 1000, watched: false, personal: { note: "before" } });
let storage: Map<string, string>;
let remote: LibraryDocument;
let version: number;
let writes: number;
let versionCalls: number;
let onVersion: (() => void | Promise<void>) | null;
let onUpload: (() => void | Promise<void>) | null;
let selectedEmail: string;
let settingsRemote: { updatedAt: number; settings: Record<string, unknown> };
let settingsVersion: number;
let settingsWrites: number;
let settingsVersionCalls: number;
let onSettingsVersion: (() => void) | null;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  auth.token = { accessToken: "account-a-token", expiresAt: NOW + 100000, source: "extension" };
  auth.offered = { accessToken: "new-token", expiresAt: NOW + 100000, source: "google" };
  auth.extension = null;
  selectedEmail = "a@example.test";
  remote = { movies: [initial()], deleted: [] };
  version = 1; writes = 0; versionCalls = 0; onVersion = null; onUpload = null;
  settingsRemote = { updatedAt: NOW - 1000, settings: {} };
  settingsVersion = 1; settingsWrites = 0; settingsVersionCalls = 0; onSettingsVersion = null;
  storage = new Map([
    ["flickcue.library", JSON.stringify({ movies: [{ ...initial(), updatedAt: NOW, personal: { note: "local change" } }], deleted: [] })],
    ["flickcue.sync", JSON.stringify({ connected: true, fileId: "list-file", account: account(), lastSyncAt: NOW - 5000 })],
    ["flickcue.settings", JSON.stringify({ region: "IN", city: "", notifications: false, letterboxd: "", letterboxdUnlinked: false, settingsUpdatedAt: NOW - 1000 })]
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key)
  });
  vi.stubGlobal("window", { addEventListener: vi.fn() });
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    const target = new URL(url);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (target.pathname.endsWith("/about")) return json({ user: { emailAddress: selectedEmail, displayName: "Verified account", photoLink: "" } });
    if (target.pathname.endsWith("/files") && options.method !== "POST") {
      const settings = target.searchParams.get("q")?.includes("flickcue-settings");
      return json({ files: [{ id: settings ? "settings-file" : "list-file" }] });
    }
    if (target.pathname.endsWith("/settings-file")) {
      if (options.method === "PATCH") {
        settingsWrites++; settingsVersion++;
        settingsRemote = JSON.parse(String(options.body));
        return json({ id: "settings-file" });
      }
      if (target.searchParams.get("fields") === "version") {
        settingsVersionCalls++; onSettingsVersion?.();
        return json({ version: String(settingsVersion) });
      }
      return json(structuredClone(settingsRemote));
    }
    if (target.searchParams.get("fields") === "version") {
      versionCalls++;
      await onVersion?.();
      return json({ version: String(version) });
    }
    if (target.pathname.startsWith("/upload/") && options.method === "PATCH") {
      writes++;
      remote = JSON.parse(String(options.body));
      // Drive's media wrapper isn't part of readRemote's document.
      remote = { movies: remote.movies, deleted: remote.deleted };
      version++;
      await onUpload?.();
      return json({ id: "list-file" });
    }
    if (target.searchParams.get("alt") === "media") return json(structuredClone(remote));
    throw new Error(`Unexpected fixture request: ${target.pathname}`);
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("list sync under interleaving requests", () => {
  it("re-reads a newer remote edit rather than overwriting the version it did not read", async () => {
    onVersion = () => {
      if (versionCalls === 2) {
        remote.movies[0] = { ...initial(), updatedAt: NOW + 1000, watched: true, personal: { note: "newer other client" } };
        version++;
      }
    };
    const store = await import("./store");
    await store.sync();
    expect(remote.movies[0].watched).toBe(true);
    expect(store.getState().library.movies[0].personal?.note).toBe("newer other client");
    expect(writes).toBe(0);
  });

  it("fails safely after repeated conflicts without a final forced upload", async () => {
    onVersion = () => { version++; };
    const store = await import("./store");
    await store.sync();
    expect(writes).toBe(0);
    expect(versionCalls).toBe(8);
    expect(store.getState().sync.status).toBe("error");
    expect(store.getState().sync.error).toMatch(/another device/);
    expect(store.getState().library.movies[0].personal?.note).toBe("local change");
  });

  it("rechecks Drive immediately before upload after the local merge", async () => {
    onVersion = () => {
      if (versionCalls === 3) {
        remote.movies[0] = { ...initial(), updatedAt: NOW + 2000, watched: true };
        version++;
      }
    };
    const store = await import("./store");
    await store.sync();
    expect(remote.movies[0].watched).toBe(true);
    expect(store.getState().library.movies[0].watched).toBe(true);
    expect(writes).toBe(0);
  });

  it("includes a local edit made while the preflight request was answering", async () => {
    const store = await import("./store");
    onVersion = () => {
      if (versionCalls === 2) {
        const document = structuredClone(store.getState().library);
        document.movies[0].personal = { note: "latest during preflight" };
        document.movies[0].updatedAt = NOW + 1000;
        store.commit(document);
      }
    };
    await store.sync();
    expect(remote.movies[0].personal?.note).toBe("latest during preflight");
    expect(store.getState().sync.status).toBe("idle");
  });

  it("reconciles another client's surviving upload before declaring success", async () => {
    onUpload = () => {
      if (writes === 1) {
        remote.movies.push({ id: "two", title: "Second title", createdAt: NOW + 1000, updatedAt: NOW + 1000 });
        version++;
      }
    };
    const store = await import("./store");
    await store.sync();
    expect(store.getState().library.movies.map((movie) => movie.id)).toContain("two");
    expect(remote.movies).toHaveLength(2);
    expect(store.getState().sync.status).toBe("idle");
  });

  it("does not publish an in-flight snapshot after sign-out", async () => {
    const store = await import("./store");
    const generation = store.getSessionGeneration();
    onVersion = async () => { if (versionCalls === 3) await store.disconnect(); };
    await store.sync();
    expect(writes).toBe(0);
    expect(store.getState().sync.connected).toBe(false);
    expect(store.getSessionGeneration()).toBeGreaterThan(generation);
  });

  it("keeps a local edit made during upload dirty until its own echo is verified", async () => {
    const store = await import("./store");
    onUpload = () => {
      if (writes === 1) {
        const latest = structuredClone(store.getState().library);
        latest.movies[0].personal = { note: "edited during upload" };
        latest.movies[0].updatedAt = NOW + 2000;
        store.commit(latest);
      }
    };
    await store.sync();
    expect(writes).toBe(2);
    expect(remote.movies[0].personal?.note).toBe("edited during upload");
    expect(store.getState().sync.status).toBe("idle");
  });
});

describe("settings conflicts", () => {
  it("re-reads a setting changed elsewhere before its own upload", async () => {
    const store = await import("./store");
    store.updateSettings({ region: "GB" });
    onSettingsVersion = () => {
      if (settingsVersionCalls === 2) {
        settingsRemote = { updatedAt: NOW + 2000, settings: { region: "US" } };
        settingsVersion++;
      }
    };
    await store.sync();
    expect(settingsWrites).toBe(0);
    expect(store.getState().settings.region).toBe("US");
  });

  it("never forces a settings overwrite after repeated version conflicts", async () => {
    const store = await import("./store");
    store.updateSettings({ region: "GB" });
    onSettingsVersion = () => { settingsVersion++; };
    await store.sync();
    expect(settingsVersionCalls).toBe(8);
    expect(settingsWrites).toBe(0);
    expect(store.getState().settings.region).toBe("GB");
    expect(store.getState().settings.settingsUpdatedAt).toBe(NOW);
  });
});

describe("verified Google account ownership", () => {
  it("does not replace credentials, account labels or file IDs when Resume selects another account", async () => {
    selectedEmail = "b@example.test";
    const store = await import("./store");
    await store.connect();
    expect(auth.token.accessToken).toBe("account-a-token");
    expect(store.getState().sync.account?.email).toBe("a@example.test");
    expect(store.getState().sync.fileId).toBe("list-file");
    expect(store.getState().sync.error).toMatch(/separate browser profile/);
    expect(writes).toBe(0);
  });

  it("remembers the owner after sign-out and refuses silent cross-account transfer", async () => {
    const store = await import("./store");
    await store.disconnect();
    selectedEmail = "b@example.test";
    await store.connect();
    expect(store.getState().sync.connected).toBe(false);
    expect(store.getState().library.movies).toHaveLength(1);
    expect(auth.token).toBeNull();
    expect(writes).toBe(0);
    expect(storage.get("flickcue.libraryAccount")).toBe("a@example.test");
  });

  it("refreshes the verified label when reconnecting the same account", async () => {
    const store = await import("./store");
    await store.connect();
    expect(store.getState().sync.account?.name).toBe("Verified account");
    expect(auth.token.accessToken).toBe("new-token");
    expect(store.getState().sync.status).toBe("idle");
  });

  it("still merges an initial anonymous local library into its first account", async () => {
    storage.delete("flickcue.sync");
    auth.token = null;
    const store = await import("./store");
    await store.connect();
    expect(store.getState().sync.connected).toBe(true);
    expect(remote.movies[0].personal?.note).toBe("local change");
    expect(storage.get("flickcue.libraryAccount")).toBe("a@example.test");
  });

  it("refuses an extension session for a different known owner", async () => {
    selectedEmail = "b@example.test";
    auth.extension = { token: { accessToken: "b-token", expiresAt: NOW + 100000 }, account: account("b@example.test"), letterboxd: "" };
    const authModule = await import("./auth");
    vi.spyOn(authModule, "canAskExtension").mockReturnValue(true);
    const store = await import("./store");
    await expect(store.connectWithExtension()).rejects.toThrow(/separate browser profile/);
    expect(auth.token.accessToken).toBe("account-a-token");
    expect(writes).toBe(0);
  });

  it("verifies the lent token even when the extension's cached profile names the old account", async () => {
    selectedEmail = "b@example.test";
    auth.extension = { token: { accessToken: "b-token", expiresAt: NOW + 100000 }, account: account(), letterboxd: "" };
    const authModule = await import("./auth");
    vi.spyOn(authModule, "canAskExtension").mockReturnValue(true);
    const store = await import("./store");
    await expect(store.connectWithExtension()).rejects.toThrow(/separate browser profile/);
    expect(auth.token.accessToken).toBe("account-a-token");
    expect(writes).toBe(0);
  });
});
