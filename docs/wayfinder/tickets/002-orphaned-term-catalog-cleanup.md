---
id: 002
title: Clean up orphaned term_catalog entries on recipe edit/delete
status: closed
type: grilling
assignee: arnau
blocked_by: []
implemented: true
---

## Question

`sync_term_catalog_for_source()` in [src/cooklang_kitchen/translations.py](../../../src/cooklang_kitchen/translations.py) only *upserts* terms (ingredients/cookware/timers/sections/preparations) found in a recipe's current source. It's called on recipe create and update ([api/admin.py](../../../src/cooklang_kitchen/api/admin.py)), but:

- Deleting a recipe never removes the `term_catalog` rows (and their `term_translations`) that were only used by that recipe.
- Editing a recipe to rename/remove an ingredient leaves the old term's catalog row (and any existing translations) behind — it's just never referenced again.

Over time this means `term_catalog` accumulates stale entries: the admin "missing translations" counts include terms nobody uses, and `translate_missing_terms()` will spend Gemini API calls translating them.

Decide the approach: recompute+diff the full term set on every write (delete rows no longer referenced across *any* recipe), track per-recipe term usage in a join table, or accept the drift and add a periodic/manual cleanup command instead. Consider that `ensure_schema()` already re-syncs every recipe's terms on app startup — could a cleanup piggyback there instead of on every write?

## Answer

Full-recompute approach, wired into every write endpoint *and* startup. No schema change (no join table) — the recipe collection is small enough that scanning every recipe's source on each write is cheap.

While designing the delete step, found that `get_db_connection()` in `db.py` never enabled `PRAGMA foreign_keys = ON` — SQLite disables FK enforcement per connection by default, so `term_translations`' `ON DELETE CASCADE` to `term_catalog` was never actually firing on any regular request connection (only `ensure_schema()`'s own one-off connection had it, and only for its own writes). Fixed as part of this ticket rather than filing separately, since the cleanup's correctness depends on it.

### Implementation (done)

- [src/cooklang_kitchen/db.py](../../../src/cooklang_kitchen/db.py): `get_db_connection()` now runs `PRAGMA foreign_keys = ON` on every connection it returns, fixing the FK-enforcement gap globally (not just for this ticket).
- [src/cooklang_kitchen/translations.py](../../../src/cooklang_kitchen/translations.py): replaced `sync_term_catalog_for_source(source, conn)` (single-recipe upsert-only) with `resync_term_catalog(conn)` — scans every recipe's source, upserts the full set of terms currently in use, then deletes any `term_catalog` row not in that set (its `term_translations` rows cascade-delete via the now-working FK). `ensure_schema()`'s manual per-recipe upsert loop and its own redundant `PRAGMA foreign_keys = ON` were both replaced by a single `resync_term_catalog(conn)` call.
- [src/cooklang_kitchen/api/admin.py](../../../src/cooklang_kitchen/api/admin.py): `create_recipe()`, `update_recipe()`, and `delete_recipe()` all call `resync_term_catalog(conn)` right before `conn.commit()` (delete previously called no term-sync function at all).
- Verified manually end-to-end against the dev server: created a recipe with `flour`+`sugar`+`bowl`, hand-inserted a `term_translations` row for `sugar` to prove cascade cleanup; edited the recipe to drop `sugar` → the `sugar` catalog row and its translation were both gone (`term_translations` count 0); deleted the recipe → `flour` (recipe-only) was pruned while `bowl` (shared with a seed recipe) correctly survived. No automated test suite exists yet to codify this (see [008](008-test-suite-strategy.md)).
