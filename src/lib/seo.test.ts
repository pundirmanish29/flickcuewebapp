import { describe, expect, it } from "vitest";

// The static files search engines read: the page head, robots.txt, the sitemap and the guides.
const files = import.meta.glob(
  ["../../index.html", "../../public/robots.txt", "../../public/sitemap.xml", "../../public/privacy.html", "../../public/contact.html", "../../public/about.html", "../../public/guides/**/index.html"],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

// The pages of the app that carry the footer links, read as source.
const sources = import.meta.glob(["../App.tsx", "../components/Landing.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const byPath = new Map(Object.entries(files).map(([path, text]) => [path.replace("../../", ""), text]));
const read = (path: string) => byPath.get(path) ?? "";
const guides = [...byPath.keys()].filter((path) => path.startsWith("public/guides/"));
const meta = (html: string, name: string) => new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`).exec(html)?.[1] ?? "";
const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";

describe("sitemap and robots", () => {
  const sitemap = read("public/sitemap.xml");
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  it("point crawlers at the sitemap", () => {
    expect(read("public/robots.txt")).toMatch(/^Sitemap: https:\/\/flickcue\.in\/sitemap\.xml$/m);
    expect(read("public/robots.txt")).not.toMatch(/Disallow: \/\s*$/m);
  });

  it("list the home page, the about, privacy and contact pages and every guide, and nothing that doesn't exist", () => {
    expect(listed).toContain("https://flickcue.in/");
    expect(listed).toContain("https://flickcue.in/about.html");
    expect(listed).toContain("https://flickcue.in/privacy.html");
    expect(listed).toContain("https://flickcue.in/contact.html");
    for (const guide of guides) expect(listed).toContain(`https://flickcue.in/${guide.replace("public/", "").replace("index.html", "")}`);
    for (const url of listed) {
      const path = url.replace("https://flickcue.in/", "");
      if (path) expect(byPath.has(`public/${path}${path.endsWith("/") ? "index.html" : ""}`), url).toBe(true);
    }
  });
});

describe("the home page head", () => {
  const home = read("index.html");

  it("says what FlickCue is in the title and description", () => {
    expect(title(home).length).toBeLessThanOrEqual(65);
    expect(title(home)).toMatch(/watchlist/i);
    expect(meta(home, "description").length).toBeGreaterThanOrEqual(70);
    expect(meta(home, "description").length).toBeLessThanOrEqual(160);
    expect(meta(home, "robots")).not.toMatch(/noindex/);
  });

  it("carries structured data that parses", () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)?.[1] ?? "";
    const data = JSON.parse(block);
    expect(data["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual(["WebSite", "WebApplication", "Organization"]);
  });

  it("holds text and links for a crawler that doesn't run scripts, and each link goes somewhere", () => {
    const root = /<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/.exec(home)?.[1] ?? "";
    expect(root).toMatch(/<h1>/);
    for (const [, href] of root.matchAll(/href="\.\/(guides\/[^"]+)"/g)) expect(byPath.has(`public/${href}index.html`), href).toBe(true);
  });
});

describe("the contact page", () => {
  const html = read("public/contact.html");

  it("has its own title, description, canonical address and one heading", () => {
    expect(title(html)).toBe("Contact FlickCue");
    expect(meta(html, "description").length).toBeGreaterThanOrEqual(70);
    expect(meta(html, "description").length).toBeLessThanOrEqual(160);
    expect(/<link rel="canonical" href="([^"]*)"/.exec(html)?.[1]).toBe("https://flickcue.in/contact.html");
    expect(html.match(/<h1>/g)?.length).toBe(1);
  });

  it("asks for a name, an email, a subject and a message, each labelled", () => {
    for (const id of ["name", "email", "subject", "message"]) {
      expect(html, id).toMatch(new RegExp(`<label for="${id}"`));
      expect(html, id).toMatch(new RegExp(`id="${id}"`));
    }
    expect(html).toMatch(/<input id="website"[^>]*tabindex="-1"/);
  });

  it("may talk to the title service and nothing else, and loads no inline script", () => {
    const policy = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
    // Cloudflare's Turnstile is the one outside script, for the optional spam check.
    expect(policy).toMatch(/script-src 'self'( https:\/\/challenges\.cloudflare\.com)?(;|$)/);
    expect(policy).toMatch(/connect-src https:\/\/api\.flickcue\.in/);
    expect(policy).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com(;|$)/);
    expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(html).not.toMatch(/<script>[^<]/);
  });

  it("carries a Turnstile site key (public, starts 0x) and the place the check appears", () => {
    expect(html).toMatch(/<form id="contact"[^>]*data-turnstile-sitekey="0x[0-9A-Za-z_-]{16,}"/);
    expect(html).toMatch(/<div id="captcha"[^>]*hidden/);
  });

  it("is covered by the privacy page, which names Turnstile and what it receives", () => {
    const privacy = read("public/privacy.html");
    expect(privacy).toContain("Cloudflare Turnstile");
    expect(privacy).toMatch(/IP address and some browser signals/);
  });

  it("is linked from the home page, the privacy page and every guide", () => {
    expect(read("index.html")).toContain("./contact.html");
    expect(read("public/privacy.html")).toContain("./contact.html");
    for (const path of guides) expect(read(path), path).toContain("../../contact.html");
  });
});

describe("the about page", () => {
  const html = read("public/about.html");

  it("has its own title, description, canonical address and one heading", () => {
    expect(title(html)).toBe("About FlickCue");
    expect(meta(html, "description").length).toBeGreaterThanOrEqual(70);
    expect(meta(html, "description").length).toBeLessThanOrEqual(160);
    expect(/<link rel="canonical" href="([^"]*)"/.exec(html)?.[1]).toBe("https://flickcue.in/about.html");
    expect(html.match(/<h1>/g)?.length).toBe(1);
  });

  it("carries structured data that parses", () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(JSON.parse(block)["@type"]).toBe("AboutPage");
  });

  it("runs no inline script and loads nothing from outside the site", () => {
    const policy = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(policy).toMatch(/script-src 'self'(;|$)/);
    expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(html).not.toMatch(/<script>[^<]/);
  });

  it("credits TMDB in its required words", () => {
    expect(html).toContain("This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.");
  });

  it("is linked from the footer of the home page, the privacy and contact pages and every guide", () => {
    expect(read("index.html")).toContain("./about.html");
    expect(read("public/privacy.html")).toContain("./about.html");
    expect(read("public/contact.html")).toContain("./about.html");
    for (const path of guides) expect(read(path), path).toContain("../../about.html");
  });

  it("is linked from the app's footer and the signed-out page", () => {
    expect(sources["../App.tsx"]).toContain('href="./about.html"');
    expect(sources["../components/Landing.tsx"]).toContain('href="./about.html"');
  });
});

describe("the guides", () => {
  it("exist", () => expect(guides.length).toBeGreaterThanOrEqual(5));

  it("each have their own title, description, canonical address and one heading", () => {
    const titles = new Set<string>();
    for (const path of guides) {
      const html = read(path);
      const slug = path.replace("public/guides/", "").replace("/index.html", "");
      expect(/<link rel="canonical" href="([^"]*)"/.exec(html)?.[1], path).toBe(`https://flickcue.in/guides/${slug}/`);
      expect(title(html).length, path).toBeLessThanOrEqual(80);
      expect(meta(html, "description").length, path).toBeGreaterThanOrEqual(70);
      expect(meta(html, "description").length, path).toBeLessThanOrEqual(160);
      expect(html.match(/<h1>/g)?.length, path).toBe(1);
      titles.add(title(html));
    }
    expect(titles.size).toBe(guides.length);
  });

  it("offer both stores", () => {
    for (const path of guides) {
      expect(read(path), path).toContain("https://addons.mozilla.org/en-US/firefox/addon/flickcue/");
      expect(read(path), path).toContain("https://chromewebstore.google.com/detail/flickcue-watch-later/");
    }
    expect(read("index.html")).toContain("https://addons.mozilla.org/en-US/firefox/addon/flickcue/");
  });

  it("link only to guides that exist", () => {
    for (const path of guides) {
      for (const [, slug] of read(path).matchAll(/href="\.\.\/([a-z-]+)\/"/g)) expect(byPath.has(`public/guides/${slug}/index.html`), `${path} -> ${slug}`).toBe(true);
    }
  });
});
