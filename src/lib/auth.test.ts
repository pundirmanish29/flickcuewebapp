import { afterEach, describe, expect, it, vi } from "vitest";
import { requestToken } from "./auth";

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
