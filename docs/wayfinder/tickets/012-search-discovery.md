---
id: 012
title: Design tags filter + ingredient search for the recipe browser
status: open
type: grilling
assignee: null
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
