# Surface brief — NexusNightsTv (Samsung Tizen TV app)

Visitor mode: **Operate** (a task-completing app UI, not a marketing page).
Primary target: `NexusNightsTv/index.html`. Related: `NexusNightsTv/css/*`, `NexusNightsTv/js/*`.

## Purpose

Redesign every screen of the TV client so a household viewer on a sofa, holding only a
remote, can find and start something within a few presses. Preserve all product truth,
content, behaviour, screen set, Arabic-first RTL, and the NEXUSNIGHT name and crest. Replace
the visual world; the incumbent look is evidence, not authority.

- **Audience / job:** any Arabic-speaking viewer in the living room; "put something on, now."
- **Action:** browse rows and tabs with the D-pad, press OK, and have it play.
- **Content / proof:** real TMDB titles and artwork, the local library, and live sports channel
  entries — all real data from the existing API. Nothing invented.
- **Constraints:** Tizen 5.0 / Chromium M63, ES5 only, fixed 1920x1080, no keyboard, no hover,
  no mouse, no page scroll, slow-or-absent network is normal.
- **Craft bar named by the user:** Netflix TV, Disney+, Shahid VIP.
- **Anti-goal named by the user:** must not look like a generic template or generated mockup.
- **Untouched:** the backend API contract, every screen's function, the crest, Arabic-first RTL
  default, the ES5 constraint, and the Tizen packaging.

## Chosen direction

**The streaming-platform canon, built around a live-first shell.** One committed field of
crimson for the active tab, primary actions and live marks; one gold accent for ratings; a
measured four-step neutral ramp carrying all elevation; a tight type scale where rank is earned
by weight and case, not by size inflation; and one signature focus behaviour — *the dim-and-lift*.

**Memorable moment:** the viewer presses down from the hero and the whole shell re-reads itself —
the arriving row lifts one tone and everything else settles one tone back — so "where the remote
is" is legible from across the room, without any motion that costs a frame.

## Roll record (Impeccable, code-led, seed:3414025084f375c4)

Roll run at `--scope direction --mode operate`; assignment acknowledged: **candidate 3 of the
grounded list — the live-first strip**. The brief pins the canon and the tab model, so the
assignment binds through topology (a live band in the shell, ahead of the hero) rather than
through materials. Standing exit taken by the user, with companions recorded in PRODUCT.md.

Dealt challengers, all weighed and **declined** (each failed both audience identification and
product clarity for this audience), each already spent as a named raise:

1. doujin event catalogue -> **grid density courage**: rows pack at whole-card scale with a
   *persistent visited mark* — the continue-watching mark is a rule on the card, not a badge.
2. acetate tab-board manual -> **the active tab is the ground**: the current tab extends and is
   filled, rather than being an underline under a transparent bar.
3. cassette j-card -> **hard two-half flip with a ruled list**: season switching is an instant
   swap, and episode lists are ruled with runtimes right-aligned.
4. 1971 pocket timetable -> **rank by weight and case, never by size**: the type scale stays
   tight; hierarchy is weight, case and colour.
5. zoo and gardens guide map -> **colour divides space**: the tab bar and the live band are
   separated by committed colour fields, not by hairlines and card shadows.
6. darkroom exposure record -> **a stepped tonal ramp as the only surface tokens, and state
   shown without colour**: four neutral tones carry all elevation, and degraded/conflict state
   is drawn with a rule or a strike, never by colour alone.

---

## Direction contract

**THESIS** — NEXUSNIGHT is a *live-first cinema*: what is on right now is the first thing the
room can reach, and everything around it is calm, cinematic browsing. It refuses the category
default in which live/sport is a buried tab and the hero is always a cold, paused poster.

**OWN-WORLD** — Ground is a measured four-step ramp: page `#0B0B0D`, band `#131317`, card
`#191920`, raised `#232329`. One committed field, NEXUSNIGHT crimson `#B3202F`, owns the active
tab, the primary action and every live mark; one gold accent `#D4AF6A` owns ratings and rank
marks. Focus is neutral white, never crimson. One radius language (8px panels and cards, pill
for chips and tags), one 8px spacing rhythm, one focus treatment. Type is IBM Plex Sans Arabic
(Arabic-first) on a tight scale; rank is weight and case. The crest keeps its hexagon, its
monogram and its gold dot.

**STORY** — In one viewport the viewer understands this is a real streaming service with
something live on right now. Within a minute they have started something without touching a
keyboard. Nothing on any screen asks them to know what a "source" or a "server URL" is.

**FIRST VIEWPORT** — Home at 1920x1080. A 96px top tab bar sits directly on the page ground,
the crest at the leading (right) edge, six tabs, the active tab drawn as an extended crimson
filled tab; a live counter chip at the trailing edge. Under it, when live data exists, a 128px
*live band* on the band tone holds up to six live channels or matches. Below that a full-bleed
hero taking the rest of the viewport, artwork with a bottom-up scrim, logo art preferred over a
text title, a three-item meta line, a clamped overview, then Play as the solid crimson primary
and Details as a ghost secondary. The signature dim-and-lift lives here and repeats on every
row and every tab.

**FORM** — Live-first strip, position 3 of 7 on the ordered list. seed: seed:3414025084f375c4

**FINISH** — unreviewed and undocumented is unfinished; this build ends with the finish review,
the verdict, DESIGN.md, and every shipping raster carrying its provenance.
