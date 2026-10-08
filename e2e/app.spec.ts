import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, showDetails, signedIn, stub, title, type Stubs } from "./support";

test("an error while drawing a page shows the notice, not a blank page", async ({ page }) => {
  await stub(page);
  // A saved title whose name isn't text (a damaged list): drawing it throws.
  await signedIn(page, [{ id: "x", title: { not: "text" }, createdAt: 1, updatedAt: 1 }]);
  await page.goto("/#/queue");
  await expect(page.getByRole("alert")).toContainText("Something went wrong");
  await expect(page.getByRole("button", { name: "Reload FlickCue" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tell us what happened" })).toHaveAttribute("href", "./contact.html");
});

test.describe("Discover when the title service can't be reached", () => {
  const list = { results: [{ id: 1, title: "A Film", poster_path: "/a.jpg", release_date: "2026-01-01", vote_average: 7.2 }], total_pages: 1 };

  test("says each list failed, offers another try, and fills the row when it works", async ({ page }) => {
    const stubs: Stubs = { offline: true, tmdb: () => list };
    await stub(page, stubs);
    await signedIn(page);
    await page.goto("/#/discover");
    const failed = page.locator(".row-failed");
    await expect(failed.first()).toContainText("Couldn't load this list");
    expect(await failed.count()).toBeGreaterThanOrEqual(2);
    await expectNoAxeViolations(page, "Discover, lists failed");
    stubs.offline = false;
    const before = await failed.count();
    await failed.first().getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".candidate-card").first()).toBeVisible();
    expect(await failed.count()).toBeLessThan(before);
  });
});

test.describe("a title's page", () => {
  const prime = { name: "Prime Video", type: "sub", url: "https://app.primevideo.com/detail?gti=amzn1.dv.gti.test" };

  test("opens the title itself where a page is known, says so where it opens a search, and offers to report a wrong link", async ({ page }) => {
    await stub(page, { tmdb: (path) => (path.startsWith("tv/1001") ? showDetails() : undefined), links: { sources: [prime] } });
    await signedIn(page, [title()]);
    await page.goto("/#/title/t1");
    const primeCard = page.locator(".watch-card", { hasText: "Prime Video" });
    await expect(primeCard).toBeVisible();
    await expect(primeCard).toHaveAttribute("href", /primevideo\.com\/detail/);
    await expect(primeCard).toContainText("With subscription");
    await expect(primeCard).not.toContainText("opens search");
    const netflixCard = page.locator(".watch-card", { hasText: "Netflix" });
    await expect(netflixCard).toContainText("opens search");
    await expect(netflixCard).toHaveAttribute("aria-label", /opens its search/);
    await expect(page.locator(".watch-credit")).toContainText("Links by Watchmode");
    const report = new URL((await page.getByRole("link", { name: "Wrong link?" }).getAttribute("href"))!, "http://x/");
    expect(report.pathname.endsWith("/contact.html")).toBe(true);
    expect(report.searchParams.get("subject")).toContain("Sample Show");
    expect(report.searchParams.get("message")).toContain("- Netflix: search");
  });

  test("a link that isn't on the service's own website is ignored", async ({ page }) => {
    await stub(page, { tmdb: (path) => (path.startsWith("tv/1001") ? showDetails() : undefined), links: { sources: [{ name: "Prime", type: "sub", url: "https://primevideo.com.evil.example/x" }] } });
    await signedIn(page, [title()]);
    await page.goto("/#/title/t1");
    const primeCard = page.locator(".watch-card", { hasText: "Prime Video" });
    await expect(primeCard).toContainText("opens search");
    expect(await primeCard.getAttribute("href")).not.toContain("evil.example");
  });

  test("shows the scores a title has, and none it doesn't (a missing score is never 0%)", async ({ page }) => {
    await stub(page, {
      tmdb: (path) => (path.startsWith("tv/1001") ? showDetails() : undefined),
      mdblist: { ratings: [{ source: "imdb", value: 9.0, votes: 369641 }, { source: "tomatoes", value: null, votes: null }, { source: "popcorn", value: null, votes: null }] }
    });
    await signedIn(page, [title()]);
    await page.goto("/#/title/t1");
    const rows = page.locator(".rating-row");
    await expect(rows.filter({ hasText: "IMDb" })).toContainText("9.0");
    await expect(rows.filter({ hasText: "369.6K" })).toHaveCount(1);
    await expect(page.locator(".ratings")).not.toContainText("0%");
    await expect(page.locator(".ratings")).not.toContainText("Tomatometer");
  });

  test("shows Tomatometer and Audience when there are scores", async ({ page }) => {
    await stub(page, {
      tmdb: (path) => (path.startsWith("tv/1001") ? showDetails() : undefined),
      mdblist: { ratings: [{ source: "imdb", value: 8.0, votes: 322016 }, { source: "tomatoes", value: 95, votes: 199 }, { source: "popcorn", value: 77, votes: 5000 }] }
    });
    await signedIn(page, [title()]);
    await page.goto("/#/title/t1");
    await expect(page.locator(".rating-row", { hasText: "Tomatometer" })).toContainText("95%");
    await expect(page.locator(".rating-row", { hasText: "Audience" })).toContainText("77%");
  });

  test("when the title service is down, says so and offers another try", async ({ page }) => {
    await stub(page, { offline: true });
    await signedIn(page);
    await page.goto("/#/title/tmdb:tv:1001");
    await expect(page.getByText("Couldn't reach FlickCue's title service")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

test("ticking the last episode of an ended show moves it to Watched, and Undo takes it back", async ({ page }) => {
  const ended = title({
    productionStatus: "Ended", releaseDate: "2022-01-01",
    seasons: [{ number: 1, episodes: 2 }], personal: { status: "watching", episodes: ["1:1"] }
  });
  await stub(page, {
    tmdb: (path) => (path.startsWith("tv/1001") ? showDetails({ status: "Ended", number_of_seasons: 1, number_of_episodes: 2, seasons: [{ season_number: 1, episode_count: 2, name: "Season 1" }], last_episode_to_air: { season_number: 1, episode_number: 2, air_date: "2022-02-01", name: "Finale" }, next_episode_to_air: null }) : undefined)
  });
  await signedIn(page, [ended]);
  await page.goto("/#/title/t1");
  await page.getByRole("button", { name: /Mark S1 E2 watched|Watched S1 E2/ }).first().click();
  await expect(page.locator(".toast")).toContainText("every episode");
  const watched = () => page.evaluate(() => JSON.parse(localStorage.getItem("flickcue.library")!).movies[0].watched === true);
  expect(await watched()).toBe(true);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await watched()).toBe(false);
});

for (const scheme of ["dark", "light"] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test("Queue, Watched, Discover and a title page have no violations", async ({ page }) => {
      await stub(page, { tmdb: (path) => (path.startsWith("tv/1001") ? showDetails() : { results: [{ id: 1, title: "A Film", poster_path: "/a.jpg", release_date: "2026-01-01", vote_average: 7.2 }], total_pages: 1 }), links: { sources: [{ name: "Prime", type: "sub", url: "https://app.primevideo.com/detail?gti=x" }] } });
      await signedIn(page, [title(), title({ id: "t2", title: "A Film", mediaType: "Movie", tmdbType: "movie", tmdbId: "2002", watched: true, watchedAt: Date.now() - 1e5 })]);
      for (const hash of ["#/queue", "#/watched", "#/discover", "#/title/t1"]) {
        await page.goto(`/${hash}`);
        await page.waitForTimeout(1500);
        // On a title page the hero and the heading beside it are text over the title's backdrop photo, which axe can't measure (here the test's
        // plain stand-in picture makes it flag the text's glow); the rest of the page is checked.
        await expectNoAxeViolations(page, hash, hash.startsWith("#/title/") ? [".tp-hero", ".tp-head"] : []);
      }
    });

    test("the reminder dialog on a Discover card has no violations", async ({ page }) => {
      await stub(page, { tmdb: () => ({ results: [{ id: 1, title: "A Film", poster_path: "/a.jpg", release_date: "2099-01-01", vote_average: 7.2 }], total_pages: 1 }) });
      await signedIn(page);
      await page.goto("/#/discover");
      await page.locator(".candidate-quick").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoAxeViolations(page, "reminder dialog");
    });
  });
}
