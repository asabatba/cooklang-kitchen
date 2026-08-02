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
- `tests/test_parser.py` (pytest, `uv run pytest`) covers `parser.py`; `translations.py` and `auth.py` are still untested (need Flask app-context fixtures) — keep this in mind when judging risk/priority of any ticket touching those two files.

## Decisions so far

- [Harden the admin surface](tickets/003-harden-admin-surface.md) — fail closed when no password is configured (no change for prod, which already has one set); add a simple in-process rate limiter/lockout on login; no CSRF token — `SameSite=Lax` accepted as sufficient. **Implemented and verified** (auth.py, api/auth.py, app.py, rate_limit.py, app.js).
- [Fix duplicate Cooklang parse in GET /api/recipes/{id}](tickets/001-fix-duplicate-parse-get-recipe.md) — parse once, reuse for both title/description fallback and the full parsed structure; `list_recipes()` left untouched (already single-parse). **Implemented and verified** (parser.py, api/recipes.py).
- [Clean up orphaned term_catalog entries on recipe edit/delete](tickets/002-orphaned-term-catalog-cleanup.md) — full-recompute-and-prune on every write + startup, no schema change; also fixed a latent bug where `get_db_connection()` never enabled `PRAGMA foreign_keys = ON`, so the `term_translations` cascade delete was never actually firing. **Implemented and verified** (db.py, translations.py, api/admin.py).
- [De-risk frontend CDN dependencies](tickets/004-derisk-frontend-cdn-dependencies.md) — real Tailwind CLI build (standalone binary, multi-stage Docker, no Node in runtime image) replacing the Play CDN; Alpine.js pinned to an exact version with an SRI hash. **Implemented and verified** (input.css, Dockerfile, index.html, .gitignore, README) — full Docker image built and run via podman to confirm.
- [Consolidate the three duplicated Cooklang tokenizer regexes](tickets/005-consolidate-cooklang-tokenizer-regex.md) — translations.py's STEP_TOKEN_RE now composes parser.py's patterns instead of an independent copy; app.js left as its own reimplementation (different language, not worth an API redesign today). **Implemented and verified** (translations.py). Found (not fixed, filed as [Fix --seed-if-missing never actually seeding](tickets/011-fix-seed-if-missing.md)) that `--seed-if-missing` is broken on a fresh install.
- [Extract shared 401/session-expiry handling in app.js](tickets/006-extract-auth-expiry-handling-appjs.md) — single `handleAuthExpired()` method used by all 4 former duplicate sites. **Implemented and verified** (app.js).
- [Extract shared recipe/shopping-list formatter logic in app.js](tickets/007-extract-recipe-shopping-formatters-appjs.md) — format-adapter objects + one shared builder per artifact type; found and fixed a latent `"# undefined"` heading bug along the way (can't occur in practice today). **Implemented and verified** (app.js) — equivalence-tested against the original output.
- [Establish a test suite strategy](tickets/008-test-suite-strategy.md) — pytest, parser.py only for now (pure functions, highest value); manual verification of earlier tickets stays acceptable going forward, not a process gap. **Implemented and verified** — 32 tests in tests/test_parser.py, confirmed they actually catch regressions (deliberately broke qty/unit parsing, 5 tests failed, restored, all pass again).
- [Decide next-feature direction](tickets/009-next-feature-direction.md) — priority order **search/discovery → meal planning → mobile/PWA**; richer authoring, recipe import, and multi-user/sharing deprioritized for now (not ruled out, just not next). Search/discovery graduated into [Design tags filter + ingredient search for the recipe browser](tickets/012-search-discovery.md); meal planning and mobile/PWA stay as ordered fog below, not yet sharp enough to ticket.
- [Decide whether recipe title/description should be translatable](tickets/010-translate-title-description.md) — confirmed as a real gap, not intentional scope, but deferred: wasn't part of the feature-priority pass, no mechanism decided. Noted as fog rather than built.
- [Fix --seed-if-missing never actually seeding on a fresh install](tickets/011-fix-seed-if-missing.md) — reordered `_cmd_run()` to check `db_path.exists()`/seed before `create_app()`, not after (seeding doesn't need an app context). **Implemented and verified** (cli.py) — reproduced the original bug, confirmed the fix, confirmed no-op behavior when the DB already exists, full test suite still passes.
- [Design tags filter + ingredient search for the recipe browser](tickets/012-search-discovery.md) — tag chips in the sidebar (OR combination), ingredient names added to the list payload and filtered client-side (case-insensitive substring, same as title/description), no new admin UI for tags. **Spec only, not built** — full implementable spec written up on the ticket for a future session.
- [Design a weekly meal-planning calendar + shopping-list integration](tickets/013-meal-planning.md) — dated, week-centric calendar with lunch/dinner slots (one recipe each), click-to-pick assignment, full-screen overlay UI, admin-only editing, cascade-delete on recipe removal. Plan recipes merge into the *same* shopping-list selection pool as manual browsing, which surfaced a real gap: quantities now double when a recipe repeats, via a `selectedIds` → `{recipeId: count}` map and `/api/combine` multiplier support, applied uniformly (not plan-only). **Implemented and verified** (`translations.py`, `api/meal_plan.py`, `api/recipes.py`, `app.py`, `app.js`, `_meal_plan.html`, `_header.html`, `_sidebar.html`) — 32 existing tests still pass, backend smoke-tested via curl (doubling, cascade delete, auth guards), UI driven end-to-end with Playwright. Along the way, found and fixed two unrelated pre-existing Tailwind cascade-order bugs (invisible "Admin On" button text; sidebar active-recipe highlight never showing) — same root cause, opportunistically fixed rather than filed separately.

## Not yet specified

- **Mobile/PWA** (3rd feature priority). No scope decided yet — offline caching strategy, service worker, add-to-homescreen manifest.
- **Deprioritized-for-now feature ideas**: richer Cooklang authoring (live preview, structured ingredient editor), recipe import (URL/photo → Cooklang), multi-user/sharing (accounts instead of one shared admin password). Not ruled out of the project — just not next; revisit if priorities shift.
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
| 007 | [Extract shared recipe/shopping-list formatter logic in `app.js`](tickets/007-extract-recipe-shopping-formatters-appjs.md) | task | closed | — |
| 008 | [Establish a test suite strategy](tickets/008-test-suite-strategy.md) | grilling | closed | — |
| 009 | [Decide next-feature direction](tickets/009-next-feature-direction.md) | grilling | closed | — |
| 010 | [Decide whether recipe title/description should be translatable](tickets/010-translate-title-description.md) | grilling | closed | — |
| 011 | [Fix --seed-if-missing never actually seeding on a fresh install](tickets/011-fix-seed-if-missing.md) | task | closed | — |
| 012 | [Design tags filter + ingredient search for the recipe browser](tickets/012-search-discovery.md) | grilling | closed | — |
| 013 | [Design a weekly meal-planning calendar + shopping-list integration](tickets/013-meal-planning.md) | grilling | closed | — |
