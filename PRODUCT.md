# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Film and TV fans who come across things to watch while browsing: a review, a trailer, a streaming page, a friend's pick. They save it in the moment (usually with the FlickCue Chrome extension) and come back later to decide what to watch tonight.

The web app is used mostly on a phone (mobile Safari and Chrome), often in the evening when choosing something, and also on desktop next to the extension. India comes first: the streaming region defaults to India (`IN`), but the product is open to anyone.

## Product Purpose

FlickCue is one watchlist that follows you everywhere. Saving, remembering and deciding are equal parts of it; none leads:

- **Save from anywhere:** one click from any page with the extension, from Discover, or by hand.
- **Get nudged on time:** reminders for tonight, tomorrow, the weekend, release day or an exact time, plus a "tonight's pick" that turns a long list into one decision.
- **Find what's next:** search (titles and people), "For you" picks based on what you saved, curated lists, and where to watch in your region.

Success means saved titles actually get watched, and the list is the same on every device without the user thinking about it.

## Positioning

- One list across the Chrome extension, this web app and the Android app, kept in a private app folder in the user's own Google Drive (`flickcue-watchlist.json`).
- There are no FlickCue accounts, no FlickCue database, no analytics and no ads. The developer never sees the list.
- It lives outside any single streaming service, so it holds everything in one place wherever each title streams.

## Operating Context

- Signed out, the site is just the homepage: what FlickCue is, a link to Add to Chrome, and Sign in. The Queue, Discover, Watched and Settings need a Google sign-in.
- Signing in uses Google (the `drive.appdata` scope only). In Chrome or Edge with the extension signed in, the site signs itself in through the extension.
- Signed in, the product has four pages: Queue (tonight's pick, "On your radar", the poster grid), Discover, Watched (history and counts) and Settings, plus a title details sheet and an account menu in the header.
- Phones get a bottom tab bar; desktop gets top navigation and a header search box.

## Capabilities and Constraints

- **Stack:** Vite + React + TypeScript, no backend, built to static files and deployed to GitHub Pages at https://flickcue.in on every push to `main`. Routing is hash-based.
- **Staying in sync:** the list format and merge rules must stay compatible with the extension and the Android app: the newest edit wins, removals leave 90-day tombstones, and fields this app doesn't know about are kept untouched (`src/lib/merge.ts`, `src/lib/editor.ts`).
- **Title data:** all film and show data comes through FlickCue's own title service, a Cloudflare Worker proxy. The UI shows no TMDB branding (the owner's decision); the privacy policy still names TMDB as the data source.
- **Google access:** tokens are short-lived (about an hour), with no refresh tokens and no client secret. When one expires the user sees Reconnect.
- **Terminology:** Queue (saved, not yet watched), Watched, Discover, Reminder / Due now, Tonight's pick, On your radar, "Why I saved this" note, Add by hand.
- **Undecided or planned:**
  - A **"You" profile page**, in the spirit of YouTube's "You" tab: profile, history, lists and settings in one place. Planned, not designed.
  - Signing in with Google in the same tab instead of a pop-up. Built, but waiting on redirect addresses in Google Cloud Console.
  - The Android app. "Coming soon"; no store link yet.

## Brand Commitments

- The name is FlickCue, written with a capital F and C, as FLICKCUE in the wordmark. The mark is three dots: green, orange, blue.
- Taglines in use: "One watchlist. Everywhere." and "Your next great watch deserves better than a screenshot."
- The voice is plain, warm and short; it talks about films and "movie night", not features.
- Title data carries no third-party branding in the UI.

## Evidence on Hand

- Homepage screenshots of the web app, taken from a demo list: `public/home-{queue,title,discover,alerts}-{desktop,phone}.webp`. The extension's save card: `public/flickcue-extension-04.webp`. The social preview image is `public/og-image.jpg`.
- Chrome Web Store listing: FlickCue – Watch Later (id `hmgefidihfkkeleeblhecnhlkbbojmmh`).
- Privacy policy: `public/privacy.html`.
- There are no testimonials, user numbers, press or reviews. Don't invent them.

## Product Principles

1. **The list belongs to the user.** Their data stays in their own Drive, nothing is tracked, and signing out never deletes anything.
2. **Every surface serves the next watch.** Saving, reminding and discovering all end in "what do I watch tonight".
3. **Phone first, in the moment.** Decisions happen on a phone, often late in the day. One-handed and fast beats dense and complete.
4. **One list, no surprises.** Every client reads and writes the same file the same way. Compatibility with the extension and the Android app is never traded for a web-only shortcut.

## Accessibility & Inclusion

No product-specific standard has been set. Current practice: keyboard access with a skip link and visible focus, labelled controls, and 44px tap targets on phones.
