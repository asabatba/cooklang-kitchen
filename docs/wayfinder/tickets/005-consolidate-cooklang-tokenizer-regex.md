---
id: 005
title: Consolidate the three duplicated Cooklang tokenizer regexes
status: open
type: grilling
assignee: null
blocked_by: []
---

## Question

The regex that recognizes Cooklang's `@ingredient{}`, `#cookware{}`, and `~timer{}` tokens is implemented independently three times:

- `INGREDIENT_RE` / `COOKWARE_RE` / `TIMER_RE` in [src/cooklang_kitchen/parser.py](../../../src/cooklang_kitchen/parser.py) (the canonical parser)
- `STEP_TOKEN_RE` in [src/cooklang_kitchen/translations.py](../../../src/cooklang_kitchen/translations.py) (re-renders localized step text)
- `CK_TOKEN_RE` and `SRC_RE` in [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js) (client-side step highlighting and raw-source syntax highlighting)

Any change to the Cooklang token grammar (e.g. supporting a new syntax variant) requires updating up to four separate regex definitions across two languages, with no shared test to catch drift between them. `translations.py`'s copy has already drifted slightly in structure from `parser.py`'s (single combined alternation vs three separate compiled patterns).

Decide: is this worth consolidating now, and to what extent? Options range from "leave the two Python copies as-is but add a regression test asserting they match" to "have `translations.py` import from `parser.py` directly" to "expose parsed-token boundaries from the API so `app.js` never needs its own regex at all" (a bigger change — the frontend currently re-derives token positions from raw text plus the already-parsed ingredient/cookware/timer arrays via sequential consumption, which is itself a fragile pattern per `highlightStep()`). Write up the chosen scope as an implementable spec.
