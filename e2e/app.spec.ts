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
  const list = { results: [{ id: 1, title: "A Film", poster_path: "/a.jpg", release_date: "2026-01-01", vote_average: 7.2, vote_count: 100, popularity: 20 }], total_pages: 1 };

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

test.describe("Discover while the posters are still downloading", () => {
  const list = { results: [1, 2, 3].map((id) => ({ id, title: `Film ${id}`, poster_path: `/p${id}.jpg`, release_date: "2026-01-01", vote_average: 7.2, vote_count: 100 })), total_pages: 1 };

  test("every card keeps its poster frame, so the row is cards that fill in, not a line of names", async ({ page }) => {
    await stub(page, { tmdb: () => list });
    // Registered after the stub's own, so it answers first: nothing arrives within the test.
    await page.route("https://image.tmdb.org/**", () => new Promise(() => {}));
    await signedIn(page);
    await page.goto("/#/discover");
    const frame = page.locator(".cinema-row .title-card-art").first();
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    // A card is a 2:3 poster; before this was fixed the frame was 0 wide, with nothing to show where the poster goes.
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeCloseTo(box.width * 1.5, 0);
  });
});

test.describe("Discover's cinema row", () => {
  const recentDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const film = (id: number, extra: Record<string, unknown> = {}) => ({ id, title: `Film ${id}`, poster_path: `/p${id}.jpg`, release_date: recentDate, vote_average: 7, vote_count: 100, popularity: 20, ...extra });
  const show = (id: number) => ({ id, name: `Show ${id}`, poster_path: `/s${id}.jpg`, first_air_date: recentDate, vote_average: 7, vote_count: 100, popularity: 20 });
  const results = (items: unknown[], total_pages = 1) => ({ results: items, total_pages });
  const stubs = (path: string, params: URLSearchParams) => {
    const page = Number(params.get("page") || "1");
    // Three pages of films in cinemas (4 a page), one page coming soon, one of them without a poster.
    if (path === "movie/now_playing") return results([1, 2, 3, 4].map((n) => film(page * 10 + n)), 3);
    if (path === "movie/upcoming") return results([film(901), film(902, { poster_path: null }), film(903)]);
    if (path === "discover/tv") return results([show(1), show(2)]);
    if (path === "discover/movie") return results([film(71), film(72)]);
    return undefined;
  };

  test("features titles with posters while keeping every film in the full cinema lists", async ({ page }) => {
    await stub(page, { tmdb: stubs });
    await signedIn(page);
    await page.goto("/#/discover");
    const cards = page.locator(".cinema-shelf").first().locator(".candidate-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.locator("h3")).toHaveText(["Film 901", "Film 903"]);
    await page.locator(".cinema-shelf").first().getByRole("button", { name: "See all" }).click();
    await expect(page.locator(".candidate-card")).toHaveCount(3);
    await expect(page.getByText("Film 902")).toBeVisible();
    await page.getByRole("button", { name: "Back to Discover" }).click();
    await page.getByRole("button", { name: "In cinemas", exact: true }).click();
    // 3 pages of 4, loaded behind the first.
    await expect(cards).toHaveCount(12);
  });

  test("has a New toggle with the latest films and shows together, and its own full list", async ({ page }) => {
    await stub(page, { tmdb: stubs });
    await signedIn(page);
    await page.goto("/#/discover");
    const row = page.locator(".cinema-shelf").first();
    await row.getByRole("button", { name: "New", exact: true }).click();
    await expect(row.getByRole("button", { name: "New", exact: true })).toHaveAttribute("aria-pressed", "true");
    const names = row.locator(".candidate-card h3");
    await expect(names).toHaveText(["Film 71", "Show 1", "Film 72", "Show 2"]);
    await expect(row.getByText("New Show").first()).toBeVisible();
    await row.getByRole("button", { name: "See all" }).click();
    await expect(page.getByRole("heading", { name: "New movies and shows" })).toBeVisible();
    await expect(page.locator(".candidate-card")).toHaveCount(4);
    // A kind filter, as on a genre.
    await page.getByRole("button", { name: "Shows", exact: true }).click();
    await expect(page.locator(".candidate-card h3")).toHaveText(["Show 1", "Show 2"]);
  });
});

test.describe("a cast member with no photo", () => {
  test("is a blank cover with a user icon, in the same frame as the photos", async ({ page }) => {
    const credits = { cast: [{ name: "No Photo", character: "A role", profile_path: null }, { name: "Has Photo", character: "Another", profile_path: "/face.jpg" }] };
    await stub(page, { tmdb: (path) => (path.startsWith("tv/1001") ? showDetails({ credits }) : undefined) });
    // The photo never arrives, so the frame is what is on show.
    await page.route("https://image.tmdb.org/**", () => new Promise(() => {}));
    await signedIn(page, [title()]);
    await page.goto("/#/title/t1");
    const blank = page.locator(".cast-row li").first().locator(".poster-person");
    await expect(blank).toBeVisible();
    await expect(blank.locator("svg")).toBeVisible();
    await expect(blank).not.toContainText("NP");
    const box = (await blank.boundingBox())!;
    expect(box.width).toBeCloseTo(96, 0);
    expect(box.height).toBeCloseTo(144, 0);
    // The one with a photo still on its way keeps the same frame.
    const waiting = (await page.locator(".cast-row li").nth(1).locator(".cast-photo").boundingBox())!;
    expect(waiting.width).toBeCloseTo(96, 0);
    expect(waiting.height).toBeCloseTo(144, 0);
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

  test("every sideways row has arrows for a mouse, 'More like this' included", async ({ page, isMobile }) => {
    test.skip(isMobile, "arrows are for a mouse; a finger swipes");
    const recommendations = { results: Array.from({ length: 14 }, (_, index) => ({ id: 500 + index, title: `Similar ${index + 1}`, poster_path: "/s.jpg", release_date: "2020-01-01", vote_average: 7 })) };
    await stub(page, { tmdb: (path) => (path.startsWith("tv/1001") ? showDetails({ recommendations }) : undefined) });
    await signedIn(page, [title()]);
    await page.goto("/#/title/t1");
    const row = page.locator(".more-row");
    await expect(row.locator(".candidate-card").first()).toBeVisible();
    const arrows = page.locator(".rail-head", { hasText: "More like this" });
    await expect(arrows.getByRole("button", { name: "Scroll More like this back" })).toBeDisabled();
    const next = arrows.getByRole("button", { name: "Scroll More like this on" });
    await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(() => row.evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
    await expect(arrows.getByRole("button", { name: "Scroll More like this back" })).toBeEnabled();
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

test.describe("Settings: a file for Letterboxd", () => {
  const watchedOn = new Date(2025, 4, 3, 21, 0).getTime();
  const film = (over: Record<string, unknown>) => title({ mediaType: "Movie", tmdbType: "movie", watched: true, watchedAt: watchedOn, ...over });
  const library = [
    film({ id: "a", title: "Arrival (2016)", year: "2016", tmdbId: "329865", personal: { rating: 4.5, review: 'Slow, "lovely".' } }),
    film({ id: "b", title: "Heat (1995)", year: "1995", tmdbId: "949" }),
    // Left out: a show, a film added by hand (no TMDB id), and one that came from Letterboxd.
    title({ id: "s", watched: true }),
    film({ id: "h", title: "Home Video", tmdbId: undefined }),
    film({ id: "l", title: "Dune (2021)", tmdbId: "438631", origin: "letterboxd", letterboxd: { watched: true, rating: 4 } })
  ];

  test("builds the file from the person's own watched films, and the next one carries only what is new", async ({ page }) => {
    await stub(page);
    await signedIn(page, library);
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "Prepare a file" }).click();
    await expect(page.getByText("2 films ready.")).toBeVisible();
    await expect(page.getByText("2 with a watch date · 1 rated · 1 reviewed.")).toBeVisible();
    await expect(page.getByText(/1 film you watched was added by hand/)).toBeVisible();
    await expectNoAxeViolations(page, "Settings, Letterboxd file ready");

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download the file" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^flickcue-letterboxd-\d{4}-\d{2}-\d{2}\.csv$/);
    const { readFileSync } = await import("node:fs");
    const lines = readFileSync((await download.path())!, "utf8").trimEnd().split("\n");
    expect(lines).toEqual([
      "tmdbID,Title,Year,WatchedDate,Rating,Review",
      '329865,"Arrival",2016,2025-05-03,4.5,"<p>Slow, \\"lovely\\".</p>"',
      '949,"Heat",1995,2025-05-03,,'
    ]);
    await expect(page.getByRole("link", { name: "letterboxd.com/import" })).toHaveAttribute("href", "https://letterboxd.com/import/");

    // A second file carries nothing until a title changes, and "everything again" still can.
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Prepare a file" }).click();
    await expect(page.getByText("Nothing new to send.")).toBeVisible();
    await page.getByRole("button", { name: "Include everything again" }).click();
    await expect(page.getByText("2 films ready.")).toBeVisible();
  });
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
