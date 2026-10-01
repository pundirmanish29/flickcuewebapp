import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetToken, getCalendarToken, getStoredToken, grantsCalendar, requestToken, storeCalendarToken, storeToken } from "./auth";
import { CALENDAR_SCOPE, GOOGLE_SCOPE } from "./config";

afterEach(() => vi.unstubAllGlobals());

describe("requestToken", () => {
  it("opens Google's window inside the tap when the sign-in script is already loaded", async () => {
    let opened = 0;
    vi.stubGlobal("window", {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (config: { callback: (response: { access_token: string; expires_in: number }) => void }) => ({
              requestAccessToken: () => {
                opened++;
                config.callback({ access_token: "token", expires_in: 3600 });
              }
            }),
            revoke: () => {}
          }
        }
      }
    });

    const pending = requestToken({ consent: true });
    // Before anything is awaited: a phone's browser only allows the window while the tap is still being handled.
    expect(opened).toBe(1);
    await expect(pending).resolves.toMatchObject({ accessToken: "token", source: "google" });
  });
});

/** A localStorage backed by a Map, and a Google sign-in that answers with the scope it is told to grant. */
function stubGoogle(grant: (asked: string) => string) {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key)
  });
  const asked: string[] = [];
  vi.stubGlobal("window", {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: { scope: string; callback: (response: Record<string, unknown>) => void }) => ({
            requestAccessToken: () => {
              asked.push(config.scope);
              config.callback({ access_token: "tok", expires_in: 3600, scope: grant(config.scope) });
            }
          }),
          revoke: () => {}
        }
      }
    }
  });
  return { store, asked };
}

describe("Calendar permission", () => {
  it("is asked for together with Drive, in one window, only when Calendar is wanted", async () => {
    const { asked } = stubGoogle((scope) => scope);
    await requestToken({ consent: true });
    await requestToken({ consent: true, calendar: true });
    expect(asked).toEqual([GOOGLE_SCOPE, `${GOOGLE_SCOPE} ${CALENDAR_SCOPE}`]);
  });

  it("is kept in its own slot, with the scope Google granted", async () => {
    stubGoogle((scope) => scope);
    const token = await requestToken({ consent: true, calendar: true });
    expect(token.scope).toContain(CALENDAR_SCOPE);
    expect(getStoredToken()?.accessToken).toBe("tok");
    expect(getCalendarToken()?.accessToken).toBe("tok");
  });

  it("is not stored when it was left unticked at Google's consent screen", async () => {
    stubGoogle(() => GOOGLE_SCOPE);
    const token = await requestToken({ consent: true, calendar: true });
    expect(grantsCalendar(token.scope)).toBe(false);
    expect(getStoredToken()?.accessToken).toBe("tok");
    expect(getCalendarToken()).toBeNull();
  });

  it("is not stored for an ordinary sign-in", async () => {
    stubGoogle((scope) => scope);
    await requestToken({ consent: true });
    expect(getCalendarToken()).toBeNull();
  });

  it("survives the extension's Drive-only token replacing the main one", async () => {
    stubGoogle((scope) => scope);
    await requestToken({ consent: true, calendar: true });
    storeToken({ accessToken: "from-extension", expiresAt: Date.now() + 3_600_000, source: "extension" });
    expect(getStoredToken()?.accessToken).toBe("from-extension");
    expect(getCalendarToken()?.accessToken).toBe("tok");
  });

  it("is not taken from a token that has no Calendar scope, or has run out", () => {
    stubGoogle((scope) => scope);
    storeCalendarToken({ accessToken: "drive-only", expiresAt: Date.now() + 3_600_000, scope: GOOGLE_SCOPE });
    expect(getCalendarToken()).toBeNull();
    storeCalendarToken({ accessToken: "old", expiresAt: Date.now() - 1000, scope: CALENDAR_SCOPE });
    expect(getCalendarToken()).toBeNull();
  });

  it("goes with the sign-in when it is forgotten", async () => {
    stubGoogle((scope) => scope);
    await requestToken({ consent: true, calendar: true });
    forgetToken();
    expect(getStoredToken()).toBeNull();
    expect(getCalendarToken()).toBeNull();
  });

  it("reads a granted-permissions string exactly", () => {
    expect(grantsCalendar(`a ${CALENDAR_SCOPE} b`)).toBe(true);
    expect(grantsCalendar(`${CALENDAR_SCOPE}.readonly`)).toBe(false);
    expect(grantsCalendar(undefined)).toBe(false);
    expect(grantsCalendar("")).toBe(false);
  });
});
