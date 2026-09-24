# FlickCue for the web

The FlickCue watchlist in the browser. It shares one list with the
[FlickCue extension](https://github.com/pundirmanish29/flickcue) and the
[Android app](https://github.com/pundirmanish29/flickcueapp) through the same
`flickcue-watchlist.json` file in Google Drive's private app-data folder.

Vite + React + TypeScript, no backend. It builds to static files.

## What's in it

- **Queue**: tonight's pick (due reminders first, then the best-reviewed title), an
  "On your radar" strip of upcoming reminders and releases, and a poster grid you can
  filter (All/Films/Shows) and sort (recently added, reminder soonest, A–Z, best
  reviewed, shortest first).
- **Title details**: TMDB/IMDb/Rotten Tomatoes scores, synopsis, genres, cast,
  where to watch in your region (included vs rent/buy), trailer, episode-by-episode
  progress for shows, and a "why I saved this" note. You can mark it watched, set a
  reminder (tonight, tomorrow, weekend, release day or an exact time), mark it
  Interested if it's unreleased, or remove it with Undo.
- **Discover**: TMDB search, plus the Android app's lists (trending, popular, top
  rated, coming soon, genres). Saving asks when to remind you, the way the
  extension's on-page card does. Titles can also be added by hand.
- **Watched**: history, newest first, with counts for this month and year and total
  hours watched.
- **Settings**: Google sign-in and sync, streaming region (default `IN`), an
  optional personal TMDB key, browser notifications for reminders while the tab is
  open, and JSON backup export/import (import merges, it doesn't overwrite).

Everything works signed out, with the list kept in `localStorage`. Signing in merges
that list into Drive.

## Staying compatible with the extension and the app

`src/lib/merge.ts` and `src/lib/editor.ts` port `drive-sync.js`'s
`mergeWatchlists` and the Android app's `LibraryEditor` rule for rule:

- every edit stamps `updatedAt`, and the newest edit wins
- removals leave 90-day tombstones
- the same title saved on two devices collapses onto the older record
- fields this app doesn't know about (Letterboxd data, meta versions, …) are left untouched

The tests in `src/lib/*.test.ts` check these rules.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # dist/
```

## Setup needed before it works on a real domain

### 1. Google sign-in

Sign-in uses Google Identity Services' token flow with the `drive.appdata` scope
only. It uses no client secret and stores no refresh token. By default it uses the
extension's **Web application** OAuth client (`DEFAULT_WEB_CLIENT_ID` in the
extension's `drive-sync.js`). The web app has to use a client from the **same
Google Cloud project**, or it would see a different app-data folder and a different
list.

In Google Cloud Console → APIs & Services → Credentials → that client, add under
**Authorized JavaScript origins**:

- `http://localhost:5173` (development)
- the deployed origin, e.g. `https://pundirmanish29.github.io`

To use a different client from the same project, set `VITE_GOOGLE_CLIENT_ID` (see
`.env.example`).

Google access tokens last about an hour. When one expires the app shows
**Reconnect**. After the first consent, reconnecting is a popup that closes by
itself.

### 2. The proxy has to accept this site's origin

Title search, Discover and details go through the FlickCue Cloudflare Worker
(`flickcue/proxy`), which holds the shared TMDB key. Right now it refuses every web
page origin (`isRefusedOrigin` only allows `chrome-extension://` and
`moz-extension://`), so those requests from the site get a `403`. Until the proxy is
changed, the site shows a message asking for a personal TMDB key in Settings, which
then calls TMDB directly.

To let the site use the proxy, allow its origin in `proxy/src/index.js`:

```js
const WEB_ORIGINS = new Set(["https://pundirmanish29.github.io", "http://localhost:5173"]);
const isAllowedOrigin = (origin) => EXTENSION_ORIGIN.test(origin) || WEB_ORIGINS.has(origin);

function isRefusedOrigin(origin) {
  return Boolean(origin) && !isAllowedOrigin(origin);
}

// and in corsHeaders():
if (origin && isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
```

Then run `npx wrangler deploy`. Only the `tmdb` route is needed. The existing rate
limits still apply.

## Deploy

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages
on every push to `main`. Turn it on in the repo under Settings → Pages → Source:
**GitHub Actions**. Routing is hash-based and asset paths are relative, so the same
build also works on Cloudflare Pages, Netlify, or any static host.

## TMDB attribution

This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
