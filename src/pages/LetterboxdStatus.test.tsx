import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicProfile, PublicImportRecord } from "../lib/letterboxdPublic";
import { Letterboxd } from "./SettingsPage";
const testState = vi.hoisted(() => ({ profile: undefined as PublicProfile | undefined, record: null as PublicImportRecord | null, error: "" }));
vi.mock("../lib/usePublicLetterboxd", () => ({ usePublicLetterboxd: () => ({ ...testState, loading: false, progress: null, startImport() {}, refresh() {} }) }));
vi.mock("../lib/store", () => ({ useAppState: () => ({ settings: { letterboxd: "filmfan" }, library: { movies: [] }, sync: { account: { email: "me@example.com" } } }) }));
describe("Standalone Letterboxd card", () => {
  it("offers web imports without an installed extension", () => {
    testState.profile = undefined; testState.record = null;
    const html = renderToStaticMarkup(<Letterboxd />);
    expect(html).toContain("Sync now");
    expect(html).toContain("No extension or Letterboxd API access is needed");
    expect(html).not.toContain("Last imported");
    expect(html).not.toContain("Extension sync");
  });
  it("shows real public identity, available categories and local import status", () => {
    testState.profile = { username: "filmfan", displayName: "Film Fan", avatarUrl: "https://a.ltrbxd.com/fan.jpg", entries: [], recentCount: 12, recentAvailable: true, watchlistAvailable: false, watchlistCount: 0, watchlistComplete: false, warnings: ["Watchlist unavailable"], fetchedAt: Date.now() };
    testState.record = { syncedAt: Date.now() - 60_000, added: 2, updated: 3, skipped: 0, warnings: [], imported: {} };
    const html = renderToStaticMarkup(<Letterboxd />);
    expect(html).toContain('src="https://a.ltrbxd.com/fan.jpg"');
    expect(html).toContain("Last imported 1 min ago on this device");
    expect(html).toContain("12 films");
    expect(html).toContain("Unavailable");
    expect(html).toContain("not your full watched history");
    expect(html).toContain("Manual file export");
    expect(html).not.toContain("Verified");
  });
});
