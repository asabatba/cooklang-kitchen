---
id: 009
title: Decide next-feature direction
status: closed
type: grilling
assignee: arnau
blocked_by: []
---

## Question

Breadth-first: what should cooklang-kitchen grow toward next, beyond fixing/simplifying what already exists? The app today is a single-admin recipe browser/editor with a Cooklang parser, a shopping-list combiner, step timers, and Gemini-backed term translation.

Candidate directions worth putting in front of the user to react to (not a commitment to build any of them — this ticket's job is to pick a direction, or a short ranked list, that then graduates into its own concrete feature ticket(s)):

- **Recipe import**: paste-a-URL or photo-to-Cooklang import, instead of hand-typing/pasting source in the admin editor.
- **Multi-user / sharing**: currently single shared admin password, no per-user accounts, no public/private recipe distinction.
- **Meal planning**: a calendar/weekly-plan view that pulls from the existing shopping-list combiner.
- **Mobile/PWA**: offline access, add-to-homescreen, since the step-timer/cook-along flow is a natural mobile use case.
- **Richer Cooklang authoring**: live preview while editing source (the admin editor's textarea has no preview today), or a structured (non-raw-text) ingredient editor.
- **Search/discovery**: current search is a client-side title/description substring filter over all recipes ([app.js](../../../src/cooklang_kitchen/static/js/app.js) `filteredRecipesByCategory`) — no ingredient-based search, no tags despite the parser already supporting a `tags` front-matter field ([parser.py](../../../src/cooklang_kitchen/parser.py) `_parse_front_matter_value`) that nothing in the UI surfaces.

Resolve via `/grilling` with the user to pick direction(s); record the answer and graduate the "Concrete next-feature scope" fog entry on the map into fresh ticket(s) for whatever's chosen.

## Answer

Priority order: **search/discovery → meal planning → mobile/PWA**. Richer authoring, recipe import, and multi-user/sharing were deliberately deprioritized in this pass — not ruled out of the project forever, just not next; they stay noted on the map in case priorities shift later.

- **Search/discovery** (first): both pieces — surfacing the parsed-but-unused `tags` field as a filter, and extending search beyond title/description to ingredient names — decided as one ticket, since they touch the same browse-experience UI and likely the same `list_recipes()`/`filteredRecipesByCategory` code paths. Graduated as [Design tags filter + ingredient search for the recipe browser](012-search-discovery.md) — a design ticket, not yet a build; the UI treatment (chips vs dropdown vs `tag:` search syntax) and the ingredient-search mechanism (extend the list payload vs a dedicated endpoint) are still open, to be resolved when that ticket is worked.
- **Meal planning** (second) and **mobile/PWA** (third): confirmed as the follow-on priorities, but not yet specified enough to ticket — no scope decisions made yet (e.g. what a "plan" entity looks like, what offline caching strategy PWA would use). Left as ordered fog on the map rather than force-ticketed before there's anything sharp to ask.
