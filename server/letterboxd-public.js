// Public data only. Keep this module identical to the proxy's copy; neither
// endpoint accepts a URL, cookies, credentials or an official API key.
const HANDLE = /^[a-z0-9_]{1,30}$/;
const MAX_BYTES = 2_000_000;
function validDate(date) { const time = Date.parse(`${date}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date; }
export function text(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, entity) => {
    if (entity[0] === "#") {
      const n = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity.toLowerCase()] || all;
  }).trim();
}
function avatar(value) {
  try { const url = new URL(value); return url.protocol === "https:" && ["a.ltrbxd.com", "s.ltrbxd.com"].includes(url.hostname) ? url.href : ""; } catch { return ""; }
}
export function parseFeed(xml, username) {
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) throw new Error("The public diary feed wasn't available.");
  const entries = new Map();
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const raw = name => (item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"))?.[1] || "").replace(/^<!\[CDATA\[|\]\]>$/g, "");
    const tag = name => text(raw(name));
    const link = tag("link");
    const slug = link.match(new RegExp(`^https://letterboxd\\.com/${username}/film/([a-z0-9-]+)/`, "i"))?.[1];
    const title = tag("letterboxd:filmTitle").slice(0, 300);
    if (!slug || !title || entries.has(slug)) continue;
    const rating = tag("letterboxd:memberRating");
    const review = [...raw("description").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter(p => !/<img\b/i.test(p[1])).map(p => text(p[1])).filter(p => p && !/^(Watched on |This review may contain spoilers)/i.test(p)).join("\n\n").slice(0, 600);
    const id = tag("tmdb:movieId") || tag("tmdb:tvId");
    const date = tag("letterboxd:watchedDate");
    entries.set(slug, {
      slug, title, year: /^\d{4}$/.test(tag("letterboxd:filmYear")) ? tag("letterboxd:filmYear") : "",
      tmdbId: /^\d{1,10}$/.test(id) ? id : "", tmdbType: tag("tmdb:movieId") ? "movie" : "tv",
      watched: true, watchedDate: validDate(date) ? date : "",
      ...(rating && Number(rating) >= 0 && Number(rating) <= 5 ? { rating: Number(rating) } : {}),
      ...(/^(yes|no)$/i.test(tag("letterboxd:memberLike")) ? { liked: /^yes$/i.test(tag("letterboxd:memberLike")) } : {}),
      ...(review ? { review } : {})
    });
  }
  const head = xml.split(/<item\b/i)[0];
  return { entries: [...entries.values()].slice(0, 100), displayName: text(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/^Letterboxd\s*[-–—]\s*/i, "").replace(/\s*[-–—]\s*Letterboxd.*$/i, "").slice(0, 100) };
}
export function parseWatchlist(html) {
  // A successful challenge page or unknown markup must never mean an empty list.
  if (!/js-watchlist-count|poster-list|poster-grid|watchlist-empty|has no films/i.test(html) || /<title>\s*(Just a moment|Attention Required)/i.test(html)) throw new Error("The public watchlist wasn't available.");
  const entries = [...html.matchAll(/data-item-name="([^"]*)"\s+data-item-slug="([a-z0-9-]+)"/g)].map(m => {
    const name = text(m[1]); const parts = name.match(/^(.*)\s\((\d{4})\)$/);
    return { slug: m[2], title: (parts ? parts[1] : name).slice(0, 300), year: parts?.[2] || "", inWatchlist: true };
  });
  const owner = html.match(/class="avatar[^"]*"[^>]*>\s*<img src="([^"]+)" alt="([^"]*)"/);
  const total = html.match(/js-watchlist-count[^>]*>\s*([\d,]+)(?:&nbsp;|\s)+films?/);
  if (!entries.length && !total && !/watchlist-empty|has no films/i.test(html)) throw new Error("The public watchlist couldn't be recognised.");
  if (!entries.length && total && Number(total[1].replace(/,/g, "")) > 0) throw new Error("The watchlist's film entries couldn't be read.");
  return { entries, displayName: owner ? text(owner[2]).slice(0, 100) : "", avatarUrl: avatar(owner?.[1] || ""), total: total ? Number(total[1].replace(/,/g, "")) : null, next: /class="[^"]*\bnext\b[^\"]*"[^>]*href=|href="[^"]*\/watchlist\/page\/\d+\/"[^>]*class="[^"]*\bnext\b/.test(html) };
}
async function readPage(path, fetchImpl) {
  const response = await fetchImpl(`https://letterboxd.com/${path}`, { redirect: "error", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/rss+xml,text/html;q=0.9" } });
  if (!response.ok) throw new Error(`Letterboxd didn't serve this public page (${response.status}).`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("The public page was too large.");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder(); let body = ""; let bytes = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > MAX_BYTES) throw new Error("The public page was too large."); body += decoder.decode(value, { stream: true }); }
    return body + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}
export async function publicProfile(username, fetchImpl = fetch) {
  if (!HANDLE.test(username)) throw new Error("Enter a valid Letterboxd username.");
  const warnings = []; const entries = new Map(); let identity = {}; let watchlistCount = 0; let watchlistComplete = false; let recentAvailable = false;
  const [feed, list] = await Promise.allSettled([
    readPage(`${username}/rss/`, fetchImpl).then(xml => parseFeed(xml, username)),
    readPage(`${username}/watchlist/`, fetchImpl).then(parseWatchlist)
  ]);
  if (feed.status === "fulfilled") {
    recentAvailable = true; identity.displayName = feed.value.displayName;
    for (const entry of feed.value.entries) entries.set(entry.slug, entry);
  } else warnings.push("Recent diary entries are unavailable. Older imports were kept.");
  if (list.status === "fulfilled") {
    let page = list.value; let pageNumber = 1; const seen = new Set();
    identity = { ...identity, ...(page.displayName ? { displayName: page.displayName } : {}), avatarUrl: page.avatarUrl };
    for (;;) {
      const before = seen.size;
      for (const entry of page.entries) { seen.add(entry.slug); entries.set(entry.slug, { ...entry, ...entries.get(entry.slug), inWatchlist: true }); }
      if (!page.next) {
        watchlistComplete = list.value.total === null || seen.size >= list.value.total;
        if (!watchlistComplete) warnings.push("Only part of the public watchlist was available. Older imports were kept.");
        break;
      }
      if (pageNumber >= 10 || seen.size >= 500 || seen.size === before) { warnings.push("Only part of the public watchlist was available. Older imports were kept."); break; }
      try { page = parseWatchlist(await readPage(`${username}/watchlist/page/${++pageNumber}/`, fetchImpl)); }
      catch { warnings.push("Only part of the public watchlist was available. Older imports were kept."); break; }
    }
    watchlistCount = seen.size;
  } else warnings.push("The public watchlist is unavailable. Older imports were kept.");
  if (feed.status === "rejected" && list.status === "rejected") throw new Error("Letterboxd didn't make this public profile available. Check the username or try again later.");
  return { username, ...identity, entries: [...entries.values()].slice(0, 600), recentAvailable, recentCount: feed.status === "fulfilled" ? feed.value.entries.length : 0, watchlistAvailable: list.status === "fulfilled", watchlistComplete, watchlistCount, warnings, fetchedAt: Date.now() };
}
export async function handlePublicProfile(username, { fetchImpl = fetch, cache = null } = {}) {
  if (!HANDLE.test(username)) return Response.json({ error: "Invalid Letterboxd username." }, { status: 400 });
  const key = `https://api.flickcue.in/letterboxd-public/${username}`;
  const saved = await cache?.match(key);
  if (saved) return saved;
  try {
    const profile = await publicProfile(username, fetchImpl);
    const response = Response.json(profile, { headers: { "Cache-Control": "public, max-age=300" } });
    if (!profile.warnings.length) await cache?.put(key, response.clone());
    return response;
  } catch (error) { return Response.json({ error: error.message || "Couldn't read the public profile." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}
