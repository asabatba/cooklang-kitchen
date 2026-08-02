---
id: 008
title: Establish a test suite strategy
status: open
type: grilling
assignee: null
blocked_by: []
---

## Question

There are zero automated tests in the repo — no `tests/` directory, no `pytest` (or any test runner) in [pyproject.toml](../../../pyproject.toml). The riskiest untested surface is [parser.py](../../../src/cooklang_kitchen/parser.py) (463 lines of regex-driven Cooklang parsing — front matter, ingredients, cookware, timers, sections, notes, fraction/mixed-number quantity parsing), followed by [translations.py](../../../src/cooklang_kitchen/translations.py)'s term-sync/localization logic and [auth.py](../../../src/cooklang_kitchen/auth.py).

Decide: what test framework (pytest is the obvious default for this stack), what gets covered first (the parser is the highest-value target — it's pure functions, no Flask context needed, and several tickets on this map touch it), and whether this blocks other refactor tickets (e.g. should [005](005-consolidate-cooklang-tokenizer-regex.md) or [001](001-fix-duplicate-parse-get-recipe.md) wait for a parser regression-test baseline first, or is that overkill for changes this small). Write up the chosen scope and starting point as an implementable spec.
