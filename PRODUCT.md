# Product

<!-- impeccable:product-schema 1 -->

## Scope

This record describes **NexusNightsTv only** — the standalone Samsung Tizen TV client that
lives in `NexusNightsTv/`. It is a child surface of the wider NexusNight service, but the
other surfaces (the React Discord-Activity client in `client/`, the Capacitor Android
wrapper in `android/`, and the Express backend in `server/`) are **out of scope** here and
are not governed by this file. `server/` is described only as a dependency the TV app
consumes.

## Platform

web

## Users

Arabic-speaking households in the MENA region watching on a Samsung smart TV, sitting on a
sofa several metres from the screen, holding only the TV remote.

- **Primary:** a non-technical viewer who turns the TV on and wants something to watch
  *now*. They browse rows with the arrow keys, press OK, and expect the stream to start.
- **Secondary:** the same person with a specific goal — find one film or series by name, or
  open today's football match — still with no keyboard.

Arabic is the default and primary reading direction (RTL); English is available as a
secondary interface language.

## Product Purpose

NexusNightsTv is a TV-native client of the existing NexusNight service. It gives a
living-room audience one remote-first app to browse TMDB-discovered movies and series, a
local media library, and live sports channel entries, and to play direct HLS/MP4 streams
through Samsung AVPlay or HTML5 video.

Success means: a viewer reaches something playing in a few remote presses, without a
keyboard, and without needing to understand what a "source" or a "server URL" is.

## Positioning

A self-hosted, Arabic-first 10-foot streaming client that aggregates TMDB discovery, a local
media library, and live sports channel keys behind a single TV-remote experience — with no
account required on the TV itself. The neighbouring Discord Activity is the social
watch-together product; this app is the solo, remote-only, living-room one.

## Operating Context

- Primary test device: Samsung UA55RU7300SXEG (RU7300, 2019). Runtime: Tizen 5.0 /
  Chromium M63, ES5 only.
- Fixed 1920×1080 landscape layout, maximised, no touch, no mouse, no keyboard.
- D-pad remote: arrows, OK/Enter, Back, Play/Pause, Rewind, Fast-Forward, Stop.
- Backend default: `https://nexusunights.tech`; the server URL is user-editable in Settings.
- Delivered as a signed WGT sideloaded onto the TV.
- On-screen Arabic/English keyboard (for Search) is the only text-entry path.
- The network in the living room can be slow or intermittent; buffering and failure are
  normal, not exceptional.

## Capabilities and Constraints

- Screens: Home, Movies, Series, Details, Search, Sports, Settings.
- Player: Samsung AVPlay for direct HLS/DASH, HTML5 video for supported MP4/HLS; subtitle
  URL normalisation and a language-preferred subtitle; live sources hide VOD seek controls;
  primary source plus alternative sources; playback-error handling with retry.
- Continue-watching is client-side, from a local watch-progress record.
- Interface language toggle (Arabic RTL / English LTR); editable backend URL with a
  connection test; playback-engine status display.
- External `embed` provider pages are **not** direct streams. On the TV they are skipped and
  the next alternative is tried; if only embed sources exist, playback cannot be guaranteed.
- Sports channel keys come from the server's `/api/sports/status` map. A key's presence is
  not a guarantee the upstream stream is live — playback is only known when a channel opens.
- Not implemented in this TV client: user accounts, synced watch history, watchlist, EPG,
  advanced audio-track selection. Do not design screens that promise these.
- Technical constraints: ES5 JavaScript only (no modules, no optional chaining, no arrow
  functions in shipped code), no modern CSS the M63 engine cannot parse, no `localStorage`
  assumptions beyond the TV's own WebStorage.
- The layout is a single fixed viewport — there is no page scroll, no pinch, and no hover.

## Brand Commitments

- **Name:** NEXUSNIGHT (as in `config.xml`). Keep the name.
- **Crest:** the hexagonal mark — hexagon outline, an "N" monogram formed by two strokes,
  and a small gold dot at the centre — currently drawn inline in the loading screen and the
  navigation rail. Keep the crest; evolve how it is presented.
- The user explicitly named the craft bar this app is measured against: **Netflix TV,
  Disney+, and Shahid VIP**. The app should sit alongside them in finish, not copy them.
- The user's stated anti-goal: it must **not** look like a generic template or an
  AI-generated mockup.

## Evidence on Hand

- `NexusNightsTv/README.md`, `FEATURES.md`, `INSTALL_GUIDE.md`, `BACKEND_SETUP.md` — the
  implemented-surface and platform-limitation record.
- `NexusNightsTv/config.xml` — widget name, app id `7P7lQLyuKP.NexusNightsTv`, required Tizen
  version, privileges.
- Live backend `https://nexusunights.tech`; TMDB artwork served through
  `/api/images/tmdb/{poster|backdrop|still|logo}/…`.
- **Absent, and must not be fabricated:** testimonials, named customers, benchmarks or
  performance figures, press coverage, pricing, or user-count claims. There are no real
  product screenshots on hand; the design must be verified by rendering it locally, never by
  describing it.

## Product Principles

1. **Remote-first.** Every action must be reachable and obvious with the D-pad alone. Focus
   is the primary affordance, not a fallback.
2. **Readable at ten feet.** Type scale, contrast, and hit areas are sized for a sofa, not a
   desk; if it is unreadable across a living room it is wrong.
3. **Arabic-native, not translated.** RTL is the layout's default state, not a mirror applied
   after the fact.
4. **Fast to first play.** Minimise the number of remote presses from launch to something
   playing.
5. **Honest states.** Slow network, missing streams, empty results, and playback failure are
   first-class screens, never afterthoughts.

## Accessibility & Inclusion

- Focus must be visible on every focusable element, distinguishable without relying on colour
  alone, and must never be lost off-screen.
- Contrast must hold up at 10-foot viewing distance and on a TV panel, not just on a desk
  monitor.
- The whole interface must be operable with one hand on a remote, with no text input.
- Screen-reader support is not a stated requirement for this surface, but roles, labels, and
  a sane focus order must not be broken by the redesign.
