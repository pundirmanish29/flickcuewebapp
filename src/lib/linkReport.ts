// "Wrong link?": a link to the contact page with the details of what the title page offered already in the
// form, so reporting a button that opens the wrong show takes one edit and one click. Nothing is sent from
// here: the person reads it, adds what's wrong, and sends it themselves.

export interface ReportedLink {
  provider: string;
  /** The title's own page on the service, or "" when the button opens the service's search. */
  url: string;
}

const clean = (text: string, max: number) => text.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

export function linkReportHref({ title, tmdbType, tmdbId, region, links }: { title: string; tmdbType?: string; tmdbId?: string; region?: string; links: ReportedLink[] }): string {
  const name = clean(title, 80) || "this title";
  const kind = tmdbType === "tv" ? "TV show" : tmdbType === "movie" ? "film" : "title";
  const lines = [
    `Title: ${name}${tmdbType && tmdbId ? ` (${kind}, TMDB ${tmdbId})` : ""}`,
    `Region: ${clean(region || "IN", 2).toUpperCase()}`,
    "Where to watch buttons:",
    ...links.slice(0, 12).map((link) => `- ${clean(link.provider, 60)}: ${link.url ? clean(link.url, 300) : "search"}`),
    "",
    "What's wrong (which button, and what it opened):",
    ""
  ];
  const query = new URLSearchParams({ subject: `Wrong streaming link: ${name}`.slice(0, 150), message: lines.join("\n").slice(0, 3000) });
  return `./contact.html?${query}`;
}
