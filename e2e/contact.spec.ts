import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, stub, type Stubs } from "./support";

const fill = async (page: Page) => {
  await page.fill("#name", "Asha Rao");
  await page.fill("#email", "asha@example.com");
  await page.fill("#subject", "Showtimes in Pune");
  await page.fill("#message", "Could you add Pune cinemas to the showtimes list, please?");
};

async function open(page: Page, stubs: Stubs = {}) {
  const { posted } = await stub(page, stubs);
  await page.goto("/contact.html");
  return posted;
}

test("names each missing field and sends nothing", async ({ page }) => {
  const posted = await open(page);
  await page.click("#send");
  for (const id of ["name", "email", "subject", "message"]) await expect(page.locator(`#${id}-error`)).not.toBeEmpty();
  await expect(page.locator("#name")).toBeFocused();
  expect(posted).toHaveLength(0);
});

test("checks the address, and clears a message once its field is right", async ({ page }) => {
  await open(page);
  await fill(page);
  await page.fill("#email", "asha@");
  await page.click("#send");
  await expect(page.locator("#email-error")).toContainText("valid email");
  await page.fill("#email", "asha@example.com");
  await expect(page.locator("#email-error")).toBeEmpty();
});

test("sends the message and shows the thanks", async ({ page }) => {
  const posted = await open(page);
  await fill(page);
  await page.click("#send");
  await expect(page.locator("#done")).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ name: "Asha Rao", email: "asha@example.com", subject: "Showtimes in Pune", website: "" });
  await page.click("#again");
  await expect(page.locator("#name")).toHaveValue("");
});

test("says what happened when it can't send", async ({ page }) => {
  const stubs: Stubs = { contact: { status: 503, body: { error: "x" } } };
  await open(page, stubs);
  await fill(page);
  await page.click("#send");
  await expect(page.locator("#banner")).toContainText("couldn't be sent");
  await expect(page.locator("#banner a")).toHaveAttribute("href", "mailto:support@flickcue.in");
  stubs.contact = { status: 429, body: { error: "x" } };
  await page.click("#send");
  await expect(page.locator("#banner")).toContainText("Wait a minute");
  stubs.contact = "network";
  await page.click("#send");
  await expect(page.locator("#banner")).toContainText("Couldn't reach FlickCue");
  await expect(page.locator("#send")).toBeEnabled();
});

test("shows the server's complaint on the field it names", async ({ page }) => {
  await open(page, { contact: { status: 400, body: { error: "x", fields: { email: "Enter a valid email address, like name@example.com." } } } });
  await fill(page);
  await page.click("#send");
  await expect(page.locator("#email-error")).toContainText("valid email");
  await expect(page.locator("#email")).toBeFocused();
});

test("is filled in from a 'Wrong link?' address, as text", async ({ page }) => {
  await stub(page);
  const subject = "Wrong streaming link: <b>x</b>";
  await page.goto(`/contact.html?subject=${encodeURIComponent(subject)}&message=${encodeURIComponent("Title: X\n<img src=x onerror=alert(1)>")}`);
  await expect(page.locator("#subject")).toHaveValue(subject);
  await expect(page.locator("#message")).toHaveValue("Title: X\n<img src=x onerror=alert(1)>");
  await expect(page.locator("#message")).toBeFocused();
  expect(await page.locator("#message").evaluate((element) => element.parentElement!.querySelectorAll("img").length)).toBe(0);
});

test.describe("the optional spam check", () => {
  // A stand-in for Cloudflare's script: renders, hands over a token after a moment, and counts resets.
  const widget = `window.__resets = 0; window.turnstile = { render(el, o) { window.__o = o; el.dataset.rendered = o.sitekey; setTimeout(() => o.callback("good-token"), 1500); return "w"; }, reset() { window.__resets++; setTimeout(() => window.__o.callback("good-token"), 100); } };`;

  async function withKey(page: Page, stubs: Stubs = {}, script = true) {
    const { posted } = await stub(page, stubs);
    await page.route(/challenges\.cloudflare\.com/, (route) => (script ? route.fulfill({ contentType: "text/javascript", body: widget }) : route.abort()));
    await page.route("**/contact.html", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('data-turnstile-sitekey=""', 'data-turnstile-sitekey="0xTESTKEY"') });
    });
    await page.goto("/contact.html");
    return posted;
  }

  test("without a site key shows nothing and loads nothing", async ({ page }) => {
    await open(page);
    await expect(page.locator("#captcha")).toBeHidden();
    expect(await page.evaluate(() => [...document.scripts].some((script) => /cloudflare/.test(script.src)))).toBe(false);
  });

  test("with a key waits for the check, then sends its token and starts the check again", async ({ page }) => {
    const posted = await withKey(page);
    await expect(page.locator("#captcha")).toHaveAttribute("data-rendered", "0xTESTKEY");
    await fill(page);
    await page.click("#send");
    await expect(page.locator("#banner")).toContainText("wait a moment");
    expect(posted).toHaveLength(0);
    await page.waitForFunction(() => document.getElementById("captcha")!.dataset.rendered && true);
    await page.waitForTimeout(1700);
    await page.click("#send");
    await expect(page.locator("#done")).toBeVisible();
    expect(posted[0]["cf-turnstile-response"]).toBe("good-token");
    expect(await page.evaluate(() => (window as unknown as { __resets: number }).__resets)).toBe(1);
  });

  test("a refused check says so and starts again", async ({ page }) => {
    await withKey(page, { contact: { status: 400, body: { error: "x", captcha: true } } });
    await page.waitForTimeout(1700);
    await fill(page);
    await page.click("#send");
    await expect(page.locator("#banner")).toContainText("check didn't pass");
    expect(await page.evaluate(() => (window as unknown as { __resets: number }).__resets)).toBe(1);
  });

  test("a blocked script falls back to the email address and never posts", async ({ page }) => {
    const posted = await withKey(page, {}, false);
    await expect(page.locator("#banner")).toContainText("spam check couldn't load");
    await fill(page);
    await page.click("#send");
    await expect(page.locator("#banner")).toContainText("isn't working");
    await expect(page.locator("#banner a")).toHaveAttribute("href", "mailto:support@flickcue.in");
    expect(posted).toHaveLength(0);
  });
});

for (const scheme of ["dark", "light"] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test("the contact page has no violations, with and without errors showing", async ({ page }) => {
      await open(page);
      await expectNoAxeViolations(page, "contact page");
      await page.click("#send");
      await expectNoAxeViolations(page, "contact page with errors");
    });
  });
}
