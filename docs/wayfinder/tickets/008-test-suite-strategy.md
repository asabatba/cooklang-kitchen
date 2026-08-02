---
id: 008
title: Establish a test suite strategy
status: closed
type: grilling
assignee: arnau
blocked_by: []
implemented: true
---

## Question

There are zero automated tests in the repo — no `tests/` directory, no `pytest` (or any test runner) in [pyproject.toml](../../../pyproject.toml). The riskiest untested surface is [parser.py](../../../src/cooklang_kitchen/parser.py) (463 lines of regex-driven Cooklang parsing — front matter, ingredients, cookware, timers, sections, notes, fraction/mixed-number quantity parsing), followed by [translations.py](../../../src/cooklang_kitchen/translations.py)'s term-sync/localization logic and [auth.py](../../../src/cooklang_kitchen/auth.py).

Decide: what test framework (pytest is the obvious default for this stack), what gets covered first (the parser is the highest-value target — it's pure functions, no Flask context needed, and several tickets on this map touch it), and whether this blocks other refactor tickets (e.g. should [005](005-consolidate-cooklang-tokenizer-regex.md) or [001](001-fix-duplicate-parse-get-recipe.md) wait for a parser regression-test baseline first, or is that overkill for changes this small). Write up the chosen scope and starting point as an implementable spec.

## Answer

Four decisions:

1. **Framework: pytest**, added as a `[dependency-groups] dev` entry via `uv add --dev pytest` (keeps `uv.lock` in sync rather than hand-editing `pyproject.toml`).
2. **Scope: `parser.py` only for now.** It's pure functions (no Flask app context needed), the highest-value target (463 lines of regex logic, touched by 3 tickets already this session), and establishes the pytest setup for later additions. `translations.py` and `auth.py` need Flask app-context fixtures — left for a future pass.
3. **Process going forward: manual verification (dev server + curl, throwaway comparison scripts) was fine for the five earlier tickets that touched these files without a test suite** — proportionate for a solo project at this scale. Not treated as a process failure; future tickets aren't blocked on test coverage existing first.
4. **Write and run tests this session**, not just a spec — and prove they catch a real regression before declaring done.

### Implementation (done)

- `pyproject.toml` / `uv.lock`: `pytest>=9.1.1` added as a dev dependency via `uv add --dev pytest`.
- [tests/test_parser.py](../../../tests/test_parser.py) (new, 32 tests): covers `parse()` — braced/bare ingredients (including preparation and quantity/unit splitting), cookware, timers (named/unnamed), inline `>> key: value` metadata, YAML-style `---` front matter (scalars, quoted scalars, bracketed lists, CSV tags, dash-list items), sources with no front matter, section headers, note paragraphs, line and block comments, rendered step text — plus `extract_title_description()` / `extract_recipe_fields()` (title/description, `introduction` fallback, list-valued title joining, missing fields) and `combine_ingredients()` (summing, case-insensitive grouping by name+unit, non-numeric quantities preserved, mixed-fraction parsing, whole-number display, alphabetical sort).
- One test I wrote was itself wrong, not a bug: I assumed `@salt to taste.` would parse as ingredient name `"salt"`, but the bare-word ingredient pattern's character class includes spaces, so it greedily matches `"salt to taste"` and only stops at punctuation. Confirmed this is existing, correct, load-bearing behavior (the seed recipes rely on it for multi-word bare ingredient names) and fixed the test to assert the real behavior, adding a second test that documents the greedy-until-punctuation semantics explicitly.
- Verified the suite actually catches regressions, not just passes trivially: temporarily changed `_parse_qty_unit`'s `"%" in raw` check to `"#" in raw` (breaking quantity/unit splitting), reran `uv run pytest` — 5 tests failed exactly where quantity/unit parsing broke — then restored the original file (confirmed via `git status`/`git diff` showing no residual changes) and reran to confirm all 32 pass again.
