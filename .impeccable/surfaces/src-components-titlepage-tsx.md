---
version: 1
slug: "src-components-titlepage-tsx"
primary_target: "src/components/TitlePage.tsx"
related_targets: ["src/components/TitleSheet.tsx"]
---

# Title page

Scope: the title details, now a full page at #/title/<id> (saved) or #/title/tmdb:<type>:<id> (not saved), replacing the modal sheet. Mode: Operate. Phone first, evening use.

Job: decide and act on one title (save, set a reminder, watch it where it streams, show a booked ticket, rate it), then read about it (story, where to watch, seasons, cast, more like this).

## Direction contract

THESIS: A ticket stub holds your plan for the title: when, where, and the one main action. It refuses the streaming-app detail page where actions scatter as an icon row under the poster.

OWN-WORLD: FlickCue's existing world: night hero over the backdrop, Archivo display at heavy weight and tight tracking, Instrument Serif italic tagline, JetBrains Mono caps labels, the three-dot green/orange/blue with lime focus. The stub is the inverted card (ink ground, paper text), a dashed perforation with round notches, mono field labels over bold values.

STORY: You open a title from any list and see at once where you stand with it (not out yet, in your queue with a reminder, booked, watched) and the next thing to do; details follow below.

FIRST VIEWPORT: Desktop: backdrop band across the top, title block bottom-right of it; the stub (poster, perforation, four state fields, main button, secondary buttons) overlaps the band on the left and stays fixed while the details scroll on the right. Phone: backdrop, small poster and title, then the stub as an inline card; a compact stub bar with state and main button is pinned above the dock while scrolling.

FORM: Ticket stub, third of seven structures on the ordered list; seed key 88cc78cd.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions

- State fields: not out (opens, countdown, where, on your list) → Save; queued (status, reminder, where, up next) → Watch on <service> or Watched it; booked (show, cinema, seats) → Show ticket; watched (when, your take, watch again) → Watch again / Unwatch.
- Label colour follows the state: orange coming, blue queued, green booked or watched.
- Mockups: https://claude.ai/artifact/BQBqnH8ajMobzJzvbJYZUz (row "C · Chosen: every state").
