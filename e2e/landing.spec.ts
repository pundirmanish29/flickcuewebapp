import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, stub } from "./support";

for (const scheme of ["dark", "light"] as const) {
  test.describe(`the signed-out page (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test("offers Google sign-in and says what Google will ask for, from the keyboard", async ({ page }) => {
      await stub(page);
      await page.goto("/");
      await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
      const summary = page.locator(".l-ask summary").first();
      await summary.focus();
      await page.keyboard.press("Enter");
      const panel = page.locator(".l-ask").first();
      await expect(panel).toContainText("A private folder for FlickCue in your Google Drive");
      await expect(panel).toContainText("Nothing else.");
      await expect(panel.getByRole("link", { name: "Read the privacy policy" })).toHaveAttribute("href", "./privacy.html");
    });

    test("has no accessibility violations", async ({ page }) => {
      await stub(page);
      await page.goto("/");
      await page.waitForTimeout(1500);
      await expectNoAxeViolations(page, "landing page");
    });
  });
}

test("a page found inside a frame hides itself", async ({ page, baseURL }) => {
  await stub(page);
  // The check is "am I the top page", the same whoever the framing page is, so a page of our own host will do.
  await page.route("**/__host.html", (route) => route.fulfill({ contentType: "text/html", body: `<iframe src="${baseURL}/" width="800" height="600"></iframe><iframe src="${baseURL}/contact.html" width="400" height="400"></iframe>` }));
  await page.goto("/__host.html");
  await page.waitForTimeout(1500);
  for (const name of [`${baseURL}/`, `${baseURL}/contact.html`]) {
    const frame = page.frames().find((candidate) => candidate.url() === name);
    expect(frame, name).toBeTruthy();
    expect(await frame!.evaluate(() => getComputedStyle(document.documentElement).display), name).toBe("none");
  }
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).display)).not.toBe("none");
});
