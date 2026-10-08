# Security notes

What the web app protects, what it relies on, and the risks accepted on purpose. Keep it true: change it
when the code changes.

## What is stored, and where

| Item | Where | Lifetime |
|---|---|---|
| The list (titles, reminders, notes, tickets' details) | This device's localStorage, and the user's own Google Drive app-data folder | Until removed |
| Google access token (`flickcue.googleToken`, `flickcue.calendarToken`) | localStorage | About an hour |
| Refresh grant (`flickcue.refreshGrant`) | localStorage, only when the site is built with `VITE_LONG_SIGNIN=1` | Until sign-out (revoked at Google) |
| Title caches (`ratings`, `streamLinks`, `serviceLinks`) | localStorage | A day to a month |

No FlickCue server stores any of it. Sign-out revokes the tokens at Google and clears the calendar state and
ticket copies from this device; the list itself stays on the device (it is the user's own data).

## Why tokens are in localStorage (accepted risk)

A script running in the page could read them. What stands against that: a strict policy on every page
(`vite.config.ts`: scripts only from this site and Google sign-in; requests only to Google and the title
service), no `innerHTML`, `eval` or `dangerouslySetInnerHTML` in the source, text rendered through React, and
external links opened with `rel="noreferrer"`. Moving the refresh grant to an httpOnly cookie held by the title
service would remove the exposure, but it signs every existing user out and needs a CSRF design, so it is a
deliberate non-goal until there is a reason.

## What the title service (`api.flickcue.in`) enforces

- It holds every API key; no client ships one.
- A web page may call only its own routes (`tmdb`, `mdblist`, `showtimes`, `oauth`, `contact`, `links`) and
  only from flickcue.in; the AI routes are extension-only. `Origin` is a filter, not authentication: a script can
  send any `Origin`, so every route also has a per-visitor rate limit, `/contact` and `/links` need an `Origin`,
  and `/links` has a shared cap on lookups that reach Watchmode and pauses itself when Watchmode refuses the key.
- Errors and logs carry status codes only, never a token, key, address or message.

## Known limits

- Pages can't send security headers (GitHub Pages). The policy is a meta tag, which can't carry
  `frame-ancestors`, so `theme.js` hides a page that finds itself framed. Proper headers need Cloudflare's proxy
  in front of flickcue.in (a header rule for `frame-ancestors 'none'`, HSTS, `Referrer-Policy`,
  `Permissions-Policy`, `X-Content-Type-Options`).
- `style-src 'unsafe-inline'` is there for React's inline styles.
- `npm audit` for the proxy lists `sharp` and `undici` inside `wrangler`/`miniflare`: build and dev tooling,
  not part of the deployed Worker, and fixed only when `wrangler` ships newer ones.
- The contact form is protected by a hidden field, a per-visitor limit and size checks; no CAPTCHA yet.
