---
id: 001
title: Fix duplicate Cooklang parse in GET /api/recipes/<id>
status: closed
type: task
assignee: arnau
blocked_by: []
implemented: true
---

## Question

`get_recipe()` in [src/cooklang_kitchen/api/recipes.py](../../../src/cooklang_kitchen/api/recipes.py) calls `extract_recipe_fields(recipe_data["source"])` (which internally calls `parse(source)`) and then separately calls `parse(recipe_data["source"])` again a few lines later to build `recipe_data["parsed"]`. Every single-recipe fetch parses the same Cooklang source twice through the full regex-based parser in [parser.py](../../../src/cooklang_kitchen/parser.py).

What's the right fix: parse once and derive both the title/description fallback and the full parsed structure from the single result? Write up the concrete change (which function signatures move, whether `extract_recipe_fields` should accept an already-parsed `Recipe` instead of a source string) as a short spec ready to implement.

Note: `list_recipes()` has the same one-parse-per-recipe-per-request pattern (via `extract_recipe_fields` only, not doubled) — decide whether that's worth touching now or is fine as-is at current scale (see "Recipe collection scale behavior" in the map's Not yet specified).

## Answer

Parse once, reuse the result for both purposes. `list_recipes()` was left as-is (single parse per recipe already, no doubling there) — not touched, per the "Recipe collection scale behavior" fog note on the map.

### Implementation (done)

- [src/cooklang_kitchen/parser.py](../../../src/cooklang_kitchen/parser.py): renamed the private `_extract_title_description(metadata)` to public `extract_title_description(metadata)` so callers that already have a parsed `Recipe` can reuse its `.metadata` without re-parsing. `extract_recipe_fields(source)` (used by `list_recipes()` and the admin create/update endpoints, which only have raw source) now calls the renamed function internally — no behavior change for those callers.
- [src/cooklang_kitchen/api/recipes.py](../../../src/cooklang_kitchen/api/recipes.py) `get_recipe()`: now calls `parse(recipe_data["source"])` exactly once, then derives both the title/description fallback (via `extract_title_description(parsed.metadata)`) and `recipe_data["parsed"]` (via `parsed.to_dict()`) from that single result.
- Verified: a unit check confirms `extract_recipe_fields()` and the new `parse()` + `extract_title_description()` path produce identical title/description output; `GET /api/recipes` and `GET /api/recipes/<id>` both smoke-tested against the dev server and return correct data.
