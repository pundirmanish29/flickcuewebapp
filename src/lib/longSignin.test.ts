import { afterEach, describe, expect, it, vi } from "vitest";
import { getCalendarToken, getStoredToken } from "./auth";
import { CALENDAR_SCOPE, GOOGLE_SCOPE, PROXY_BASE_URL } from "./config";
import { forgetGrant, getGrant, renewAccess, revokeGrant, signInForLong } from "./longSignin";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface Call { url: string; method: string; body: unknown; headers: Record<string, string> }

/** localStorage as a Map, a page at flickcue.in whose Google sign-in answers with `code`, and a fetch that follows a script. */
function setup(replies: Array<Response | Error>, code = "the-code") {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key)
  });
  vi.stubGlobal("location", { origin: "https://flickcue.in" });
  const configs: Array<Record<string, unknown>> = [];
  let opened = 0;
  vi.stubGlobal("window", {
    google: {
      accounts: {
        oauth2: {
          initCodeClient: (config: Record<string, unknown> & { callback: (response: { code: string; scope: string }) => void }) => {
            configs.push(config);
            return { requestCode: () => { opened++; config.callback({ code, scope: "https://www.googleapis.com/auth/drive.appdata" }); } };
          }
        }
      }
    }
  });
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const raw = typeof init.body === "string" ? init.body : undefined;
    calls.push({ url, method: init.method ?? "GET", headers, body: raw && headers["Content-Type"] === "application/json" ? JSON.parse(raw) : raw });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return reply.clone();
  });
  return { store, calls, configs, opened: () => opened };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("signInForLong", () => {
  it("opens Google's window inside the tap, asking only for Drive", async () => {
    const env = setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" })]);
    const pending = signInForLong("me@example.com");
    expect(env.opened()).toBe(1);
    await pending;
    expect(env.configs[0]).toMatchObject({ ux_mode: "popup", login_hint: "me@example.com", scope: "https://www.googleapis.com/auth/drive.appdata" });
  });

  it("hands the code to the title service with this site's origin, and keeps both tokens", async () => {
    const env = setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1", scope: "s" })]);
    const token = await signInForLong();
    expect(env.calls[0].url).toBe(`${PROXY_BASE_URL}/oauth/token`);
    expect(env.calls[0].body).toEqual({ code: "the-code", redirect_uri: "https://flickcue.in" });
    expect(token).toMatchObject({ accessToken: "a1", source: "google", scope: "s" });
    expect(getStoredToken()?.accessToken).toBe("a1");
    expect(getGrant()?.token).toBe("r1");
  });

  it("keeps a grant already held when Google sends no new refresh token", async () => {
    setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" }), json({ access_token: "a2", expires_in: 3600 })]);
    await signInForLong();
    await signInForLong();
    expect(getGrant()?.token).toBe("r1");
    expect(getStoredToken()?.accessToken).toBe("a2");
  });

  it("says so when the service refuses, and stores nothing", async () => {
    setup([json({ error: "This proxy only serves the FlickCue extension and web app." }, 403)]);
    await expect(signInForLong()).rejects.toThrow(/only serves/);
    expect(getStoredToken()).toBeNull();
    expect(getGrant()).toBeNull();
  });

  it("says so when the service can't be reached", async () => {
    setup([new TypeError("Failed to fetch")]);
    await expect(signInForLong()).rejects.toThrow(/Check your connection/);
  });
});

describe("with Calendar", () => {
  const both = `${GOOGLE_SCOPE} ${CALENDAR_SCOPE}`;

  it("asks Google for Calendar in the same window only when it is wanted", async () => {
    const env = setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" })]);
    await signInForLong("", true);
    expect(env.configs[0].scope).toBe(both);
    const plain = setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" })]);
    await signInForLong("", false);
    expect(plain.configs[0].scope).toBe(GOOGLE_SCOPE);
  });

  it("stores the Calendar token too when Google says Calendar was granted", async () => {
    setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1", scope: both })]);
    await signInForLong("", true);
    expect(getStoredToken()?.accessToken).toBe("a1");
    expect(getCalendarToken()?.accessToken).toBe("a1");
  });

  it("leaves the Calendar slot empty when it was unticked at Google's consent screen", async () => {
    setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1", scope: GOOGLE_SCOPE })]);
    await signInForLong("", true);
    expect(getStoredToken()?.accessToken).toBe("a1");
    expect(getCalendarToken()).toBeNull();
  });

  it("renews the Calendar token along with the Drive one", async () => {
    setup([
      json({ access_token: "a1", expires_in: 3600, refresh_token: "r1", scope: both }),
      json({ access_token: "a2", expires_in: 3600, scope: both })
    ]);
    await signInForLong("", true);
    await renewAccess();
    expect(getStoredToken()?.accessToken).toBe("a2");
    expect(getCalendarToken()?.accessToken).toBe("a2");
  });
});

describe("renewAccess", () => {
  it("does nothing without a grant", async () => {
    const env = setup([json({})]);
    expect(await renewAccess()).toEqual({ ok: false, reason: "none" });
    expect(env.calls).toHaveLength(0);
  });

  it("trades the grant for a new access token and stores it", async () => {
    const env = setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" }), json({ access_token: "a2", expires_in: 1800 })]);
    await signInForLong();
    const renewal = await renewAccess();
    expect(env.calls[1].url).toBe(`${PROXY_BASE_URL}/oauth/refresh`);
    expect(env.calls[1].body).toEqual({ refresh_token: "r1" });
    expect(renewal).toMatchObject({ ok: true, token: { accessToken: "a2" } });
    expect(getStoredToken()?.accessToken).toBe("a2");
    expect(getGrant()?.token).toBe("r1");
  });

  it("forgets a grant Google no longer honours", async () => {
    setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" }), json({ error: "invalid_grant" }, 400)]);
    await signInForLong();
    expect(await renewAccess()).toEqual({ ok: false, reason: "revoked" });
    expect(getGrant()).toBeNull();
  });

  it("keeps the grant through a bad moment, an unreachable service or a refusal of this site", async () => {
    for (const reply of [json({ error: "boom" }, 502), new TypeError("Failed to fetch"), json({ error: "This proxy only serves the FlickCue extension and web app." }, 403)]) {
      setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" }), reply]);
      await signInForLong();
      expect(await renewAccess()).toEqual({ ok: false, reason: "offline" });
      expect(getGrant()?.token).toBe("r1");
    }
  });

  it("gives up when the service never answers", async () => {
    vi.useFakeTimers();
    const store = new Map<string, string>([["flickcue.refreshGrant", JSON.stringify({ token: "r1", savedAt: 1 })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const outcome = renewAccess();
    await vi.advanceTimersByTimeAsync(20_001);
    expect(await outcome).toEqual({ ok: false, reason: "offline" });
  });
});

describe("revokeGrant", () => {
  it("tells Google, and forgets the grant here", async () => {
    const env = setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" }), json({})]);
    await signInForLong();
    await revokeGrant();
    expect(env.calls[1].url).toBe("https://oauth2.googleapis.com/revoke");
    expect(env.calls[1].body).toBe("token=r1");
    expect(getGrant()).toBeNull();
  });

  it("forgets it here even when Google can't be reached", async () => {
    setup([json({ access_token: "a1", expires_in: 3600, refresh_token: "r1" }), new TypeError("Failed to fetch")]);
    await signInForLong();
    await expect(revokeGrant()).resolves.toBeUndefined();
    expect(getGrant()).toBeNull();
  });

  it("does nothing when there is no grant", async () => {
    const env = setup([json({})]);
    await revokeGrant();
    forgetGrant();
    expect(env.calls).toHaveLength(0);
  });
});
