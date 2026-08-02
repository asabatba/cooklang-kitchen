---
label: wayfinder:map
status: open
tracker: local-markdown
---

# Cooklang Kitchen — Issues, Refactors & Next Features

> Local-markdown wayfinder map (no `gh` CLI / issue tracker configured for this repo). Child tickets live in `tickets/*.md`. A ticket is **claimed** by setting `assignee` in its frontmatter, **blocked** while any id in its `blocked_by` list is still open, and part of the **frontier** when open + unassigned + unblocked.

## Destination

A scoped ticket backlog for cooklang-kitchen — bugs/issues, refactor & simplification opportunities, and next-feature proposals across the whole app (Flask/Jinja2 backend, Alpine.js/Tailwind frontend, Cooklang parser, Gemini-backed translations) — each sized as a decision-ready ticket that can be handed to an implementer one at a time.

## Notes

- Solo project, single maintainer (arnau), personal use + CapRover self-deploy.
- Tracker is local-markdown: no `gh` CLI available and no tracker was configured when charting began. If GitHub issues become available later, this map can be migrated.
- Whole app is in scope for this pass; nothing was pre-excluded (see "Out of scope").
- Codebase is small (~3200 lines total) — surveyed directly by reading every source file rather than via subagents.
- Consult `/grilling` and `/domain-modeling` when resolving tickets, as per default wayfinder practice.
- Zero automated tests exist anywhere in the repo — keep this in mind when judging risk/priority of any ticket that touches the parser, auth, or translation sync logic.

## Decisions so far

- [Harden the admin surface](tickets/003-harden-admin-surface.md) — fail closed when no password is configured (no change for prod, which already has one set); add a simple in-process rate limiter/lockout on login; no CSRF token — `SameSite=Lax` accepted as sufficient. **Implemented and verified** (auth.py, api/auth.py, app.py, rate_limit.py, app.js).
- [Fix duplicate Cooklang parse in GET /api/recipes/{id}](tickets/001-fix-duplicate-parse-get-recipe.md) — parse once, reuse for both title/description fallback and the full parsed structure; `list_recipes()` left untouched (already single-parse). **Implemented and verified** (parser.py, api/recipes.py).
- [Clean up orphaned term_catalog entries on recipe edit/delete](tickets/002-orphaned-term-catalog-cleanup.md) — full-recompute-and-prune on every write + startup, no schema change; also fixed a latent bug where `get_db_connection()` never enabled `PRAGMA foreign_keys = ON`, so the `term_translations` cascade delete was never actually firing. **Implemented and verified** (db.py, translations.py, api/admin.py).
- [De-risk frontend CDN dependencies](tickets/004-derisk-frontend-cdn-dependencies.md) — real Tailwind CLI build (standalone binary, multi-stage Docker, no Node in runtime image) replacing the Play CDN; Alpine.js pinned to an exact version with an SRI hash. **Implemented and verified** (input.css, Dockerfile, index.html, .gitignore, README) — full Docker image built and run via podman to confirm.
- [Consolidate the three duplicated Cooklang tokenizer regexes](tickets/005-consolidate-cooklang-tokenizer-regex.md) — translations.py's STEP_TOKEN_RE now composes parser.py's patterns instead of an independent copy; app.js left as its own reimplementation (different language, not worth an API redesign today). **Implemented and verified** (translations.py). Found (not fixed, filed as [Fix --seed-if-missing never actually seeding](tickets/011-fix-seed-if-missing.md)) that `--seed-if-missing` is broken on a fresh install.
- [Extract shared 401/session-expiry handling in app.js](tickets/006-extract-auth-expiry-handling-appjs.md) — single `handleAuthExpired()` method used by all 4 former duplicate sites. **Implemented and verified** (app.js).

## Not yet specified

- **Concrete next-feature scope.** Once [Decide next-feature direction](tickets/009-next-feature-direction.md) picks a direction (e.g. meal planning, multi-user/sharing, recipe import from URL/photo, PWA/offline support, mobile-friendly gestures), that will graduate into its own feature ticket(s).
- **Deployment operational concerns.** Backup/persistence strategy for the SQLite data volume on CapRover, and whether any structured logging/monitoring is wanted — not explored deeply enough yet to phrase as a sharp question.
- **Recipe collection scale behavior.** `list_recipes()` and `get_recipe()` re-parse Cooklang source on every request with no caching; fine at the current handful of seed recipes, but not yet clear whether/when this becomes worth addressing — revisit once the collection size or feature direction (e.g. bulk import) is known.
- **Shared Tailwind class extraction.** Long, near-identical utility class strings repeat across every button in the templates (a DX/maintainability concern, not a user-facing bug). Worth revisiting only after [De-risk frontend CDN dependencies](tickets/004-derisk-frontend-cdn-dependencies.md) lands, since a build-step migration would be the natural place to introduce shared component classes.

## Out of scope

*(none yet — first pass, letting survey findings determine scope boundaries as they come up)*

## Tickets

*(local-markdown substitute for a native child-issue query — kept as a convenience index; the authoritative state is each ticket's own frontmatter)*

| # | Title | Type | Status | Blocked by |
|---|-------|------|--------|------------|
| 001 | [Fix duplicate Cooklang parse in `GET /api/recipes/<id>`](tickets/001-fix-duplicate-parse-get-recipe.md) | task | closed | — |
| 002 | [Clean up orphaned `term_catalog` entries on recipe edit/delete](tickets/002-orphaned-term-catalog-cleanup.md) | grilling | closed | — |
| 003 | [Harden the admin surface](tickets/003-harden-admin-surface.md) | grilling | closed | — |
| 004 | [De-risk frontend CDN dependencies](tickets/004-derisk-frontend-cdn-dependencies.md) | grilling | closed | — |
| 005 | [Consolidate the three duplicated Cooklang tokenizer regexes](tickets/005-consolidate-cooklang-tokenizer-regex.md) | grilling | closed | — |
| 006 | [Extract shared 401/session-expiry handling in `app.js`](tickets/006-extract-auth-expiry-handling-appjs.md) | task | closed | — |
| 007 | [Extract shared recipe/shopping-list formatter logic in `app.js`](tickets/007-extract-recipe-shopping-formatters-appjs.md) | task | open | — |
| 008 | [Establish a test suite strategy](tickets/008-test-suite-strategy.md) | grilling | open | — |
| 009 | [Decide next-feature direction](tickets/009-next-feature-direction.md) | grilling | open | — |
| 010 | [Decide whether recipe title/description should be translatable](tickets/010-translate-title-description.md) | grilling | open | — |
| 011 | [Fix --seed-if-missing never actually seeding on a fresh install](tickets/011-fix-seed-if-missing.md) | task | open | — |
