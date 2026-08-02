---
id: 010
title: Decide whether recipe title/description should be translatable
status: open
type: grilling
assignee: null
blocked_by: []
---

## Question

The translation system ([translations.py](../../../src/cooklang_kitchen/translations.py)) only localizes structured Cooklang tokens — ingredient names, cookware names, timer labels, section headers, preparation notes — via `term_catalog`/`term_translations`. The recipe's `title` and `description` fields are free text stored directly on the `recipes` row and are never translated: `get_recipe()` in [api/recipes.py](../../../src/cooklang_kitchen/api/recipes.py) returns `recipe_data["title"]`/`["description"]` straight from the DB regardless of the requested `lang`.

Is this intentional scope (translation covers *cooking terms*, not prose) or a gap? Decide whether title/description should join the term-catalog system (treating the whole string as one term, which works for the current word/short-phrase term model) or need a different mechanism (e.g. a per-recipe-per-language field, since title/description are free-form sentences rather than short repeated terms — the term_catalog's dedup-by-normalized-key design assumes short reusable terms, not full sentences unique per recipe). Write up the chosen approach as an implementable spec, or explicitly rule it out of scope if not wanted.
