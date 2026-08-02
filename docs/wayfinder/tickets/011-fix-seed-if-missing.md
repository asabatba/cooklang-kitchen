---
id: 011
title: Fix --seed-if-missing never actually seeding on a fresh install
status: open
type: task
assignee: null
blocked_by: []
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
