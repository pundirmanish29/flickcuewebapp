import { describe, expect, it } from "vitest";

// The static files search engines read: the page head, robots.txt, the sitemap and the guides.
const files = import.meta.glob(
  ["../../index.html", "../../public/robots.txt", "../../public/sitemap.xml", "../../public/privacy.html", "../../public/guides/**/index.html"],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

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

  it("list the home page, the privacy page and every guide, and nothing that doesn't exist", () => {
    expect(listed).toContain("https://flickcue.in/");
    expect(listed).toContain("https://flickcue.in/privacy.html");
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
    expect(data["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual(["WebSite", "WebApplication"]);
  });

  it("holds text and links for a crawler that doesn't run scripts, and each link goes somewhere", () => {
    const root = /<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/.exec(home)?.[1] ?? "";
    expect(root).toMatch(/<h1>/);
    for (const [, href] of root.matchAll(/href="\.\/(guides\/[^"]+)"/g)) expect(byPath.has(`public/${href}index.html`), href).toBe(true);
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

  it("link only to guides that exist", () => {
    for (const path of guides) {
      for (const [, slug] of read(path).matchAll(/href="\.\.\/([a-z-]+)\/"/g)) expect(byPath.has(`public/guides/${slug}/index.html`), `${path} -> ${slug}`).toBe(true);
    }
  });
});
