import { describe, expect, it } from "vitest";
import { linkReportHref } from "./linkReport";

const params = (href: string) => new URL(href, "https://flickcue.in/").searchParams;

describe("the wrong-link report", () => {
  const links = [{ provider: "Amazon Prime Video", url: "https://app.primevideo.com/detail?gti=amzn1.dv.gti.1" }, { provider: "Netflix", url: "" }];

  it("opens the contact page with the title and every button's address in the form", () => {
    const href = linkReportHref({ title: "Reacher", tmdbType: "tv", tmdbId: "108978", region: "in", links });
    expect(href.startsWith("./contact.html?")).toBe(true);
    const p = params(href);
    expect(p.get("subject")).toBe("Wrong streaming link: Reacher");
    const message = p.get("message")!;
    expect(message).toContain("Title: Reacher (TV show, TMDB 108978)");
    expect(message).toContain("Region: IN");
    expect(message).toContain("- Amazon Prime Video: https://app.primevideo.com/detail?gti=amzn1.dv.gti.1");
    expect(message).toContain("- Netflix: search");
    expect(message).toContain("What's wrong");
  });

  it("stays within the form's limits, whatever the title is", () => {
    const p = params(linkReportHref({ title: "x".repeat(500), links: Array.from({ length: 50 }, (_, i) => ({ provider: `Service ${i}`, url: `https://example.com/${"y".repeat(400)}` })) }));
    expect(p.get("subject")!.length).toBeLessThanOrEqual(150);
    expect(p.get("message")!.length).toBeLessThanOrEqual(3000);
  });

  it("can't smuggle extra lines in through a title or service name", () => {
    const message = params(linkReportHref({ title: "A\nTitle: fake", links: [{ provider: "Netflix\n- Fake: https://evil.example", url: "" }] })).get("message")!;
    expect(message.split("\n").filter((line) => line.startsWith("Title:")).length).toBe(1);
    expect(message).not.toMatch(/^- Fake:/m);
  });
});
