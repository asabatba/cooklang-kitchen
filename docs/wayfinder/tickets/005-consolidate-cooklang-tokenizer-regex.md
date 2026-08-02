---
id: 005
title: Consolidate the three duplicated Cooklang tokenizer regexes
status: closed
type: grilling
assignee: arnau
blocked_by: []
implemented: true
---

## Question

The regex that recognizes Cooklang's `@ingredient{}`, `#cookware{}`, and `~timer{}` tokens is implemented independently three times:

- `INGREDIENT_RE` / `COOKWARE_RE` / `TIMER_RE` in [src/cooklang_kitchen/parser.py](../../../src/cooklang_kitchen/parser.py) (the canonical parser)
- `STEP_TOKEN_RE` in [src/cooklang_kitchen/translations.py](../../../src/cooklang_kitchen/translations.py) (re-renders localized step text)
- `CK_TOKEN_RE` and `SRC_RE` in [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js) (client-side step highlighting and raw-source syntax highlighting)

Any change to the Cooklang token grammar (e.g. supporting a new syntax variant) requires updating up to four separate regex definitions across two languages, with no shared test to catch drift between them. `translations.py`'s copy has already drifted slightly in structure from `parser.py`'s (single combined alternation vs three separate compiled patterns).

Decide: is this worth consolidating now, and to what extent? Options range from "leave the two Python copies as-is but add a regression test asserting they match" to "have `translations.py` import from `parser.py` directly" to "expose parsed-token boundaries from the API so `app.js` never needs its own regex at all" (a bigger change — the frontend currently re-derives token positions from raw text plus the already-parsed ingredient/cookware/timer arrays via sequential consumption, which is itself a fragile pattern per `highlightStep()`). Write up the chosen scope as an implementable spec.

## Answer

Two decisions:

1. **Python side**: `translations.py`'s `STEP_TOKEN_RE` now composes `parser.py`'s `INGREDIENT_RE`/`COOKWARE_RE`/`TIMER_RE` (via `.pattern` string concatenation) instead of an independent copy — `parser.py` is the single source of truth, drift is now structurally impossible rather than just detected.
2. **JS side**: left as-is. `app.js`'s regex is an inherently separate reimplementation (different language), and fully eliminating it would mean redesigning the API to expose token boundaries — a bigger change not justified today. Revisit only if the API changes for other reasons.

### Implementation (done)

- [src/cooklang_kitchen/translations.py](../../../src/cooklang_kitchen/translations.py): `STEP_TOKEN_RE = re.compile(f"{INGREDIENT_RE.pattern}|{COOKWARE_RE.pattern}|{TIMER_RE.pattern}")`, built from patterns imported from `parser.py`. Safe because `_render_localized_step_text()`'s `replace()` closure only inspects `match.group(0)`'s leading character (`@`/`#`/`~`), never numbered groups — so the exact group layout produced by the composed pattern doesn't matter, only that it matches the same substrings.
- Verified: a standalone comparison script confirmed the old inline pattern and the new composed pattern produce byte-identical matches across 7 test strings covering braced/bare ingredients, cookware, timers, preparations with nested parens, and unicode names. Also exercised the real code path — started the dev server, requested a seeded recipe with `?lang=es` (translations empty, so text falls back to English, but the same `STEP_TOKEN_RE`-driven substitution path runs) — rendered correctly with no errors.

### Found, not fixed (out of this ticket's scope)

While verifying, found that `cooklang-kitchen run --seed-if-missing` looks broken for a genuinely fresh install: `_cmd_run()` in [cli.py](../../../src/cooklang_kitchen/cli.py) calls `create_app()` first, which runs `ensure_schema()` — and `sqlite3.connect()` inside `get_db_connection()` creates the physical `.db` file as a side effect of merely connecting, before any table exists via `--seed-if-missing`'s own check. So by the time `_cmd_run()` checks `db_path.exists()`, it's already `True` (file exists, but with only the schema `ensure_schema()` creates — empty tables, no sample recipes) and `create_db()` (which seeds the sample recipes) never runs. Reproduced by deleting `data/recipes.db` and running `cooklang-kitchen run --seed-if-missing`: server starts, `/api/recipes` returns `[]`. Not part of this ticket's scope (regex consolidation) — flagged for the map's fog rather than fixed here.
