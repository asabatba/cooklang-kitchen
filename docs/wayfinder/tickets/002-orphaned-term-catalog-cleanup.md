---
id: 002
title: Clean up orphaned term_catalog entries on recipe edit/delete
status: open
type: grilling
assignee: null
blocked_by: []
---

## Question

`sync_term_catalog_for_source()` in [src/cooklang_kitchen/translations.py](../../../src/cooklang_kitchen/translations.py) only *upserts* terms (ingredients/cookware/timers/sections/preparations) found in a recipe's current source. It's called on recipe create and update ([api/admin.py](../../../src/cooklang_kitchen/api/admin.py)), but:

- Deleting a recipe never removes the `term_catalog` rows (and their `term_translations`) that were only used by that recipe.
- Editing a recipe to rename/remove an ingredient leaves the old term's catalog row (and any existing translations) behind — it's just never referenced again.

Over time this means `term_catalog` accumulates stale entries: the admin "missing translations" counts include terms nobody uses, and `translate_missing_terms()` will spend Gemini API calls translating them.

Decide the approach: recompute+diff the full term set on every write (delete rows no longer referenced across *any* recipe), track per-recipe term usage in a join table, or accept the drift and add a periodic/manual cleanup command instead. Consider that `ensure_schema()` already re-syncs every recipe's terms on app startup — could a cleanup piggyback there instead of on every write?
