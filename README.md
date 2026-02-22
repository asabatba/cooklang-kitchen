# Cooklang Kitchen

Cooklang Kitchen is a Flask web app to browse, edit, and combine Cooklang recipes.

## Project structure

```text
cooklang-kitchen/
├── src/
│   └── cooklang_kitchen/
│       ├── api/
│       │   ├── admin.py
│       │   ├── auth.py
│       │   └── recipes.py
│       ├── app.py
│       ├── auth.py
│       ├── cli.py
│       ├── config.py
│       ├── db.py
│       ├── parser.py
│       ├── seed.py
│       ├── web.py
│       ├── wsgi.py
│       └── templates/
│           └── index.html
├── pyproject.toml
├── Dockerfile
├── captain-definition
└── docs/
```

## Local development

```bash
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -e .

cooklang-kitchen seed
cooklang-kitchen run --debug --seed-if-missing
```

Open `http://localhost:5000`.

## CLI commands

```bash
cooklang-kitchen run --debug
cooklang-kitchen seed
cooklang-kitchen set-password
cooklang-kitchen set-password mypassword
cooklang-kitchen set-password --remove
```

## Configuration

Environment variables:

- `SECRET_KEY`: Flask session secret (recommended in production)
- `SECRET_FILE`: fallback file path for generated session secret (default: `${DATA_DIR}/.secret_key`)
- `DATA_DIR`: base data directory (default: `./data`)
- `DB_PATH`: SQLite DB path (default: `${DATA_DIR}/recipes.db`)
- `PASSWORD_FILE`: admin password hash path (default: `${DATA_DIR}/.admin_password`)
- `SESSION_COOKIE_SECURE`: set `true` behind HTTPS
- `SESSION_COOKIE_SAMESITE`: cookie policy (default: `Lax`)
- `SESSION_DAYS`: login session duration in days (default: `14`)

## CapRover deployment

This repo is configured for Dockerfile deployment through CapRover.

- `captain-definition` points to `Dockerfile`
- Gunicorn entrypoint: `cooklang_kitchen.wsgi:app`
- Bind address: `0.0.0.0:${PORT:-80}`

Deploy:

```bash
caprover deploy
```

Recommended CapRover app settings:

- Environment variable: `SECRET_KEY=<strong-random-value>`
- Environment variable: `SESSION_COOKIE_SECURE=true`
- Persistent directory mapping for `/app/data`
