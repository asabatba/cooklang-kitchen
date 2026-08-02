---
id: 011
title: Fix --seed-if-missing never actually seeding on a fresh install
status: closed
type: task
assignee: arnau
blocked_by: []
implemented: true
---

## Question

`_cmd_run()` in [src/cooklang_kitchen/cli.py](../../../src/cooklang_kitchen/cli.py) does:

```python
def _cmd_run(args: argparse.Namespace) -> None:
    app = create_app()
    db_path = Path(app.config["DB_PATH"])
    if args.seed_if_missing and not db_path.exists():
        create_db(db_path)
    app.run(host=args.host, port=args.port, debug=args.debug)
```

`create_app()` runs `ensure_schema()` inside its `app_context()`, which calls `get_db_connection()` — and `sqlite3.connect(db_path)` creates the physical `.db` file as a side effect of merely connecting, before any table exists. So by the time `_cmd_run()` checks `db_path.exists()`, the file already exists (with `ensure_schema()`'s empty tables, no sample recipes), and `create_db()` — which seeds the 3 sample recipes — never runs.

Reproduced: delete `data/recipes.db`, run `cooklang-kitchen run --seed-if-missing`, then `GET /api/recipes` returns `[]`.

Found while verifying [Consolidate the three duplicated Cooklang tokenizer regexes](005-consolidate-cooklang-tokenizer-regex.md) — out of that ticket's scope, so filed separately.

Decide the fix: check `db_path.exists()` *before* calling `create_app()` (reorder), or have `ensure_schema()` itself seed sample data when the `recipes` table is newly created (folds seeding into schema setup, but blurs "ensure schema" and "seed data" responsibilities), or something else. Likely a small, unambiguous fix — write it up and implement.

## Answer

Reorder: check `db_path.exists()` and seed *before* calling `create_app()`. `create_db()` (in [seed.py](../../../src/cooklang_kitchen/seed.py)) uses its own plain `sqlite3.connect()`, not Flask's `get_db_connection()`/app context, so it doesn't need `create_app()` to have run first — seeding first and initializing the app second avoids the ordering conflict entirely, rather than needing `ensure_schema()` to know anything about seeding.

This ordering has a nice side effect: when `create_app()`'s `ensure_schema()` runs afterward, its `resync_term_catalog()` call (from ticket 002) sees the freshly-seeded recipes immediately and populates `term_catalog` for them on the very first run, instead of only after a later restart.

### Implementation (done)

- [src/cooklang_kitchen/cli.py](../../../src/cooklang_kitchen/cli.py) `_cmd_run()`: moved the `db_path.exists()` check and `create_db()` call before `create_app()`, using `Config.DB_PATH` directly (already imported) instead of `app.config["DB_PATH"]`.
- Verified: reproduced the exact original bug scenario (delete `data/recipes.db`, run with `--seed-if-missing`) — now returns the 3 seeded recipes, and `term_catalog` has 31 rows populated immediately. Also verified the flag correctly no-ops when the DB already exists: manually inserted a 4th recipe, restarted with `--seed-if-missing`, confirmed all 4 recipes survive (not wiped/re-seeded). Full `uv run pytest` suite (32 tests) still passes.
