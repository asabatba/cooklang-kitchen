---
id: 013
title: Design a weekly meal-planning calendar + shopping-list integration
status: closed
type: grilling
assignee: arnau
blocked_by: []
---

## Question

Graduated from the "Meal planning" fog entry on the map (originally noted in [Decide next-feature direction](009-next-feature-direction.md) as the 2nd feature priority, after search/discovery): "No scope decided yet — what a 'plan'/calendar entity looks like, how it ties into the existing shopping-list combiner."

Breadth-first design questions to resolve:

- What does a "plan" look like — a dated calendar, or a date-less repeating weekly template?
- How many meal slots per day, if any?
- Can a slot hold more than one recipe?
- How does a plan tie into the existing ephemeral shopping-list combiner (`POST /api/combine`, [api/recipes.py:64-92](../../../src/cooklang_kitchen/api/recipes.py))? Does assigning a recipe to the plan automatically add it to the cart, or is that a separate action? Does the plan share the same selection pool as manual browsing, or a separate one?
- What happens if the same recipe is planned twice in a week — does the shopping list double the quantities? (No servings/scaling logic exists anywhere in the app today — this is a real gap to confront, not sidestep.)
- Does editing the plan require admin login, like recipe CRUD, or is it open like the shopping-list combiner?
- How do you assign a recipe to a slot — pick from a list, or drag-and-drop?
- What happens to a plan entry when its recipe is deleted?
- Where does the calendar live in the UI — a 4th column alongside the existing sidebar/main/cart three-column grid, or a full-screen overlay?

Not yet a build — this ticket's job is to work through those design questions via `/grilling` and produce an implementable spec, per default wayfinder practice on this map.

## Answer

Eleven decisions, breadth-first:

1. **Dated calendar, week-centric.** Real dates (not a repeating template), but the UI is built around paging one week at a time (not a month grid, not infinite scroll) — matches how meal planning is actually used ("what's for dinner this week").
2. **Two slots per day: lunch and dinner.** No breakfast slot. `category` on `recipes` is recipe-type ("Pasta", "Soups"), not meal-time — there was no existing concept to reuse or conflict with.
3. **One recipe per slot.** No multi-recipe composition (e.g. main + side) — nothing else in the app composes recipes into a unit; `recipe_id` is a single nullable column, unique per `(date, slot)`.
4. **Shopping-list integration shares the existing selection pool.** Plan-derived recipes merge into the same cart state used for manual sidebar selection (`selectedIds` in `app.js`), not a separate one-off list — it's one shopping trip regardless of source.
5. **Quantities double when a recipe repeats.** If the same recipe is planned twice, the combined shopping list should reflect two portions' worth of ingredients — this surfaces a real, previously-nonexistent scaling/multiplier concept (`POST /api/combine` currently does `SELECT ... WHERE id IN (...)`, which silently dedups a repeated id via SQL — confirmed no doubling happens today, and no `servings` multiplier exists anywhere).
6. **The multiplier applies uniformly, everywhere — not just from the plan.** Rather than two selection semantics (a plain set for manual browsing, a count for the plan) feeding one combine call, `selectedIds` becomes a `{recipeId: count}` map throughout. Manual sidebar toggling keeps its existing on/off UX (one click adds at count 1, clicking again removes the entry entirely back to 0) — there's no manual way to reach count > 1 except via the plan contributing repeats.
7. **Editing the plan is admin-only, for now.** Unlike the shopping-list combiner (no auth), plan mutations are persisted data, so they're gated behind the existing `@admin_required` decorator used for recipe CRUD — reading/viewing the plan is not restricted.
8. **Assignment is click-to-pick, not drag-and-drop.** Click an empty or filled slot to open a picker (reusing the existing `searchFilter`/`filteredRecipesByCategory` text-search pattern from the sidebar); click a recipe to assign. The app has zero drag-and-drop today — no touch-support/drop-target complexity worth introducing.
9. **Cascade delete.** `meal_plan_entries.recipe_id` gets `ON DELETE CASCADE`, matching the existing `term_translations` precedent (ticket 002) — an emptied slot is the least-surprising outcome of a rare, deliberate recipe deletion, versus rendering a special "(deleted recipe)" placeholder everywhere.
10. **Full-screen overlay, not a 4th column.** The existing three-column grid ([index.html:96-102](../../../src/cooklang_kitchen/templates/index.html)) has no room for a 7×2 week grid without cramping it further on top of the existing mobile-drawer breakpoints. A new header icon toggles a full-viewport overlay, same boolean-toggle pattern as `sidebarOpen`/`cartOpen`.
11. **Adding the week to the shopping list is an explicit action**, not automatic on every plan edit — an "add this week to shopping list" button inside the overlay. Automatic sync would mean every plan tweak silently mutates the cart, which is confusing while you're still deciding what to cook.

### Implementable spec (not built this session)

**Database** — add alongside the existing dual-defined schema (`seed.py:60-88` for CLI seeding, `translations.py:157-206`'s `ensure_schema()` run on every startup — no migrations framework exists, match the existing convention rather than introduce one for a single table):

```sql
CREATE TABLE IF NOT EXISTS meal_plan_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,               -- ISO date, YYYY-MM-DD
    slot TEXT NOT NULL CHECK (slot IN ('lunch', 'dinner')),
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, slot)
)
```

`PRAGMA foreign_keys = ON` is already set globally in `db.py:16` (ticket 002), so the cascade needs no additional wiring.

**Backend — new blueprint (e.g. `api/meal_plan.py`, prefix `/api/meal-plan`):**

- `GET /api/meal-plan?start=<date>&end=<date>` — public (no auth), returns `[{date, slot, recipe_id}]` for the range. Return bare `recipe_id`, not a joined recipe payload — the client already holds the full recipe list (same pattern as the existing sidebar), so it joins client-side rather than duplicating title/description over the wire.
- `PUT /api/meal-plan/<date>/<slot>` — `@admin_required`, body `{recipe_id}`, upserts (assign or replace whatever's there).
- `DELETE /api/meal-plan/<date>/<slot>` — `@admin_required`, clears the slot.

**Backend — `/api/combine` and `combine_ingredients()` multiplier support** (`api/recipes.py:64-92`, `parser.py:413-463`):

- Request body changes from `{ids: [...]}` (implicitly-unique list) to `{ids: [{id, count}, ...]}` (or equivalent) — explicit counts are clearer than relying on list-repetition semantics that the current `WHERE id IN (...)` query would silently collapse anyway.
- `combine_ingredients()` needs a count per recipe's ingredient list — simplest approach: feed that recipe's parsed ingredient list into the merge `count` times (reuses the existing per-entry numeric-summing logic unchanged, no separate multiply-by-N codepath needed).
- `recipe_titles` in the response: no need to list a doubled recipe's title twice — cosmetic, left to the implementer.

**Frontend — `app.js`:**

- `selectedIds` (Set) → `selectedCounts` (`{recipeId: count}` object). `toggleSelect(id)` keeps its current on/off UX: sets count to 1 if absent, deletes the key entirely if present (never manually increments past 1).
- New state: `planOpen` (bool, new header toggle, same pattern as `sidebarOpen`/`cartOpen`), `planWeekStart` (date, defaults to the Monday of the current week), `planEntries` (`{​"date_slot": recipe_id}`, fetched via `GET /api/meal-plan` on open/week-change), `planPickerTarget` (`{date, slot} | null`), a local search string for the picker (mirrors `searchFilter`).
- New getters: `currentWeekDates` (7 dates from `planWeekStart`), `weekRecipeCounts` (tally of `recipe_id` occurrences across the 7×2 visible grid, for the "add to shopping list" button).
- New methods: `changeWeek(deltaDays)` (±7), `openSlotPicker(date, slot)`, `assignRecipeToSlot(recipeId)` (calls `PUT`, updates `planEntries`), `clearSlot(date, slot)` (calls `DELETE`), `addWeekToShoppingList()` (merges `weekRecipeCounts` into `selectedCounts`, then reuses the existing `updateShoppingList()` flow to re-fetch the combined list).

**Frontend — templates:**

- New `_meal_plan.html` partial: full-viewport overlay (`fixed inset-0`, z-index alongside `_modals.html`'s conventions), week header with prev/next arrows and a "this week" label, a 7-column (stacked on mobile) × 2-row (lunch/dinner) grid. Each cell shows the assigned recipe's title (click to reassign) or an empty "+ add" placeholder (click to open the picker). The picker reuses the sidebar's existing recipe-list-plus-search markup, filtered by its own local search string, closing on selection.
- New header icon (alongside the existing sidebar/cart toggles) to open the overlay.

**Out of scope for this ticket** (already decided above): drag-and-drop assignment, breakfast slot, multi-recipe slots, automatic plan→cart sync, non-admin plan editing, a distinct "(deleted recipe)" placeholder state.

No code written this session — handed off as a ready-to-implement spec for a future work-through-the-map pass. Note for whoever builds it: the `selectedCounts` refactor touches the *existing* manual shopping-list feature (not just new code), since Q6 decided the multiplier applies uniformly rather than being plan-only — budget for that blast radius (checkbox toggle logic, `/api/combine` request shape, `combine_ingredients()`) alongside the new calendar UI/backend.

### Built and verified (follow-up session, same day)

Implemented exactly per the spec above: `meal_plan_entries` table (`translations.py` `ensure_schema()`), new `api/meal_plan.py` blueprint (public `GET`, admin-gated `PUT`/`DELETE`, registered in `app.py`), `/api/combine` + the request body switched to `{ids: [{id, count}]}` (`api/recipes.py`; `combine_ingredients()` itself needed no signature change — a recipe's ingredient list is just fed in `count` times), `app.js`'s `selectedIds` → `selectedCounts` map plus the new plan state/methods, and `_meal_plan.html` (new overlay partial) + a header "Plan" toggle.

Verified via `uv run pytest` (32 existing tests still pass unchanged — `combine_ingredients()`'s signature didn't move) and a live run: seeded a scratch DB, smoke-tested the API directly with `curl` (assign/clear, cross-week doubling — planning the same recipe twice and confirming `POST /api/combine` returned exactly double quantities, 401/404/400 guards, cascade delete after removing a planned recipe), then drove the real UI with Playwright (full run required installing `playwright`+chromium locally, since neither existed in this environment — not committed to the project).

Playwright's first run rendered the new template unstyled (stacked rows instead of a 7-column grid): the compiled `app.css` (a gitignored, Tailwind-v4-CLI-built artifact per [ticket 004](004-derisk-frontend-cdn-dependencies.md)) on disk predated the new template's classes. This turned out to be operator error, not a project gap — [README.md](../../../README.md)'s "CSS" section already documents rebuilding via `tailwindcss ... --watch`; it just needed running, which is on whoever's iterating on templates locally, not something to fix in code. After rebuilding, the week grid, picker, admin-only controls (verified hidden, not just deselected, for a logged-out viewer), today-highlight, and the doubled-quantity shopping list all rendered correctly with zero browser console errors.

**Unrelated pre-existing bugs found and fixed (same follow-up session):** while admin-testing, noticed the header's "Admin On" active-state button rendered invisible white-on-white text. Root cause, confirmed by checking rule order in the compiled `app.css`: Tailwind v4 resolves same-specificity utility conflicts by declaration order in the generated stylesheet, not DOM class-list order — and `.bg-white{...}` happened to be emitted after `.bg-amber-600{...}`, so the static base class was silently beating the conditionally-applied one. Checked every other `:class` binding in the templates for the same base-class-vs-conditional-class pattern and found one more real instance (the sidebar's active-recipe highlight, `bg-transparent` beating `bg-amber-50/80` the same way — it never showed which recipe was open) plus two look-alikes that happened to already win the cascade by luck (the timer-highlight in `_main.html`, the selection checkbox in `_sidebar.html`) and were left alone. Fixed the two real breaks (`_header.html`, `_sidebar.html`) by making the static and conditional classes mutually exclusive — moving the resting-state colors into the `:class` ternary's `false` branch instead of leaving them in the static `class` attribute — so exactly one wins by DOM presence, not by generator-internal ordering. Verified via computed-style checks and screenshots post-fix. Unrelated to meal planning; fixed opportunistically since it was the identical bug class discovered while building this feature.
