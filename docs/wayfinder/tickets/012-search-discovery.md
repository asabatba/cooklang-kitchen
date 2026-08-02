---
id: 012
title: Design tags filter + ingredient search for the recipe browser
status: closed
type: grilling
assignee: arnau
blocked_by: []
---

## Question

Graduated from [Decide next-feature direction](009-next-feature-direction.md): search/discovery was picked as the first next-feature direction to build, ahead of meal planning and mobile/PWA.

Two related gaps in the current browse experience:

1. **Tags are parsed but never surfaced.** [parser.py](../../../src/cooklang_kitchen/parser.py)'s `_parse_front_matter_value()` already supports a `tags` front-matter field (bracketed list, CSV, or dash-list form — see [parser.py:154-167](../../../src/cooklang_kitchen/parser.py)), but nothing in the API or UI does anything with it. No filter, no display, no way to know a recipe has tags at all short of viewing its raw source.
2. **Search is title/description substring only.** `filteredRecipesByCategory` in [app.js](../../../src/cooklang_kitchen/static/js/app.js) filters the already-fetched recipe list client-side by `title`/`description` substring match. `list_recipes()` in [api/recipes.py](../../../src/cooklang_kitchen/api/recipes.py) strips `source` entirely from the list payload (by design, to keep it light) — so there's no ingredient data client-side to search against without a payload or endpoint change.

Design the two together as one browse-experience change. Open questions to resolve when this ticket is worked:

- **Tags UI**: chips in the sidebar (filter by clicking a tag), a dedicated tag browser/dropdown, or folded into the existing search box (e.g. `tag:vegan`)?
- **Ingredient search mechanism**: extend `list_recipes()`'s payload to include ingredient names (still lighter than full `source`), or add a dedicated search endpoint that queries server-side, or something else? Consider the "Recipe collection scale behavior" note on the map — this is a good moment to decide whether client-side full-list-then-filter still holds up if payload grows.
- Should ingredient search match on exact ingredient name, substring, or fuzzy match?
- Does the admin recipe editor need a tags input field, or is hand-editing the front matter in the source textarea sufficient (ties into the deprioritized "richer authoring" direction — probably out of scope here, but worth a conscious call).

Not yet a build — this ticket's job is to work through those design questions (likely via `/grilling` and possibly `/prototype` for the tags UI) and produce an implementable spec.

## Answer

Five decisions:

1. **Tags UI: chips in the sidebar.** Visually discoverable at a glance without typing anything — fits a small personal collection where seeing what tags exist matters.
2. **Tag combination: OR.** Selecting multiple tag chips broadens results (recipes matching *any* selected tag), not narrows — more useful for discovery at this collection size than AND-narrowing.
3. **Ingredient search: extend `list_recipes()`'s payload**, filter entirely client-side alongside the existing title/description logic — no new endpoint, no per-keystroke round-trip. Proportionate given the collection is small (dozens to low hundreds, not thousands) and already fetched whole.
4. **Match type: case-insensitive substring**, for both ingredient and tag search — consistent with the existing title/description matching, no new dependency or matching library.
5. **No new admin UI for tags.** Hand-editing `tags: [...]` in the source textarea's front matter is sufficient — the parser already handles all three forms (bracketed list, CSV, dash-list). A dedicated tags input field borders the deprioritized "richer authoring" direction from [ticket 009](009-next-feature-direction.md) — explicitly out of scope here.

### Implementable spec (not built this session)

**Backend — `api/recipes.py` `list_recipes()`:**

- Add `tags` (list, from `parsed_fields`/metadata — reuse `extract_recipe_fields`'s underlying `parse()` call, don't add a third parse) and `ingredients` (list of ingredient name strings only, not full ingredient dicts — quantity/unit/preparation aren't needed for search) to the per-recipe payload.
- `parse(source).metadata.get("tags")` needs normalizing to a list in all cases: `_parse_front_matter_value` already returns a list for bracketed/CSV/dash forms, but a single untagged scalar (e.g. `tags: vegan` with no comma) currently returns a bare string — decide whether to wrap single scalars in a list for consistency (recommended: yes, so the frontend always gets `tags: string[]`, never `tags: string | string[]`).

**Frontend — `app.js`:**

- New Alpine state: `selectedTags: []` (array of currently-toggled tag chips), alongside the existing `searchFilter`.
- New computed getter `availableTags`: the deduplicated, sorted union of all `tags` across `this.recipes` (drives which chips render).
- `filteredRecipesByCategory` extended: a recipe passes if (a) `searchFilter` is empty OR matches title/description/ingredient names (substring, case-insensitive — extend the existing `.includes()` check to also test each ingredient name), AND (b) `selectedTags` is empty OR the recipe's tags intersect `selectedTags` (OR logic — `recipe.tags.some(t => selectedTags.includes(t))`).
- `toggleTag(tag)` method: adds/removes from `selectedTags`, mirroring the existing `toggleSelect()` pattern for shopping-list selection.

**Frontend — templates:**

- `_sidebar.html`: a chip row (likely above the search input or above the category list) rendering `availableTags`, each chip `@click="toggleTag(tag)"` with an active/selected visual state (`:class` binding, similar to existing conditional class patterns in `_main.html`'s timer-active styling).

**Out of scope for this ticket** (already decided above): admin tags input UI, server-side search endpoint, fuzzy matching, exact-match mode.

No code written this session — handed off as a ready-to-implement spec for the next work-through-the-map pass.
