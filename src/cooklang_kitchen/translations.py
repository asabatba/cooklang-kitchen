import json
import re
from collections.abc import Iterable, Sequence
from copy import deepcopy
from typing import Any

from flask import current_app

from .db import get_db_connection
from .parser import parse

TERM_INGREDIENT = "ingredient"
TERM_COOKWARE = "cookware"
TERM_TIMER = "timer"
TERM_SECTION = "section"
TERM_PREPARATION = "preparation"

TERM_TYPES = (
    TERM_INGREDIENT,
    TERM_COOKWARE,
    TERM_TIMER,
    TERM_SECTION,
    TERM_PREPARATION,
)

TERM_TYPE_LABELS = {
    TERM_INGREDIENT: "Ingredients",
    TERM_COOKWARE: "Tools",
    TERM_TIMER: "Timer Labels",
    TERM_SECTION: "Sections",
    TERM_PREPARATION: "Preparation",
}

STEP_TOKEN_RE = re.compile(
    r"@([^@#~{}\s]+(?:\s+[^@#~{}\s]+)*?)\{([^}]*)\}(?:\(([^)]*)\))?"
    r"|@([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)"
    r"|#([^@#~{}\s]+(?:\s+[^@#~{}\s]+)*?)\{([^}]*)\}(?:\(([^)]*)\))?"
    r"|#([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)"
    r"|~([^@#~{}\s]*)\{([^}]*)\}"
)


class TranslationError(RuntimeError):
    pass


def normalize_term_key(text: str) -> str:
    return " ".join(str(text or "").split()).strip().lower()


def get_supported_languages() -> list[str]:
    return list(current_app.config.get("TRANSLATION_LANGUAGES", ["en"]))


def is_supported_language(language_code: str | None) -> bool:
    if language_code is None:
        return False
    return language_code.strip().lower() in get_supported_languages()


def normalize_language_code(language_code: str | None) -> str:
    code = (language_code or "en").strip().lower() or "en"
    if not is_supported_language(code):
        raise TranslationError(f"Unsupported language: {code}")
    return code


def get_language_options() -> list[dict[str, str]]:
    return [
        {
            "code": code,
            "label": "English" if code == "en" else code.upper(),
        }
        for code in get_supported_languages()
    ]


def collect_recipe_terms_from_source(source: str) -> list[dict[str, str]]:
    parsed = parse(source)
    terms: dict[tuple[str, str], dict[str, str]] = {}

    def add_term(term_type: str, source_text: str) -> None:
        text = " ".join(str(source_text or "").split()).strip()
        if not text:
            return
        source_key = normalize_term_key(text)
        key = (term_type, source_key)
        if key not in terms:
            terms[key] = {
                "term_type": term_type,
                "source_key": source_key,
                "source_text": text,
            }

    for ingredient in parsed.ingredients:
        add_term(TERM_INGREDIENT, ingredient.name)
        add_term(TERM_PREPARATION, ingredient.preparation)

    for cookware in parsed.cookware:
        add_term(TERM_COOKWARE, cookware.name)

    for timer in parsed.timers:
        add_term(TERM_TIMER, timer.name)

    for step in parsed.steps:
        add_term(TERM_SECTION, step.section)

    return list(terms.values())


def upsert_term_catalog(conn, terms: Iterable[dict[str, str]]) -> None:
    rows = [
        (term["term_type"], term["source_key"], term["source_text"])
        for term in terms
    ]
    if not rows:
        return

    conn.executemany(
        """
        INSERT INTO term_catalog (term_type, source_key, source_text)
        VALUES (?, ?, ?)
        ON CONFLICT(term_type, source_key) DO UPDATE SET
            source_text = excluded.source_text,
            updated_at = CURRENT_TIMESTAMP
        """,
        rows,
    )


def resync_term_catalog(conn) -> None:
    """
    Recompute term_catalog from every recipe currently in the DB: upsert
    every term still in use, then delete catalog rows no longer referenced
    by any recipe. term_translations rows for deleted terms are removed via
    the ON DELETE CASCADE FK (requires PRAGMA foreign_keys = ON, set by
    get_db_connection()).
    """
    rows = conn.execute("SELECT source FROM recipes").fetchall()
    terms_by_key: dict[tuple[str, str], dict[str, str]] = {}
    for row in rows:
        for term in collect_recipe_terms_from_source(row["source"]):
            terms_by_key[(term["term_type"], term["source_key"])] = term

    upsert_term_catalog(conn, terms_by_key.values())

    catalog_rows = conn.execute("SELECT id, term_type, source_key FROM term_catalog").fetchall()
    orphan_ids = [
        catalog_row["id"]
        for catalog_row in catalog_rows
        if (catalog_row["term_type"], catalog_row["source_key"]) not in terms_by_key
    ]
    if orphan_ids:
        placeholders = ",".join("?" * len(orphan_ids))
        conn.execute(f"DELETE FROM term_catalog WHERE id IN ({placeholders})", orphan_ids)


def ensure_schema() -> None:
    conn = get_db_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT,
                source TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS term_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                term_type TEXT NOT NULL,
                source_key TEXT NOT NULL,
                source_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(term_type, source_key)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS term_translations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                term_id INTEGER NOT NULL,
                language_code TEXT NOT NULL,
                translated_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(term_id, language_code),
                FOREIGN KEY (term_id) REFERENCES term_catalog(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_term_translations_language ON term_translations(language_code)"
        )

        resync_term_catalog(conn)
        conn.commit()
    finally:
        conn.close()


def get_translation_lookup(language_code: str) -> dict[tuple[str, str], str]:
    language = normalize_language_code(language_code)
    if language == "en":
        return {}

    conn = get_db_connection()
    try:
        rows = conn.execute(
            """
            SELECT tc.term_type, tc.source_key, tt.translated_text
            FROM term_translations tt
            JOIN term_catalog tc ON tc.id = tt.term_id
            WHERE tt.language_code = ?
            """,
            (language,),
        ).fetchall()
        return {
            (row["term_type"], row["source_key"]): row["translated_text"]
            for row in rows
        }
    finally:
        conn.close()


def translate_term_text(
    term_type: str,
    source_text: str,
    language_code: str,
    lookup: dict[tuple[str, str], str] | None = None,
) -> str:
    text = str(source_text or "")
    if not text:
        return text

    language = normalize_language_code(language_code)
    if language == "en":
        return text

    if lookup is None:
        lookup = get_translation_lookup(language)
    return lookup.get((term_type, normalize_term_key(text)), text)


def _localize_ingredient(item: dict[str, Any], language_code: str, lookup) -> dict[str, Any]:
    item["name"] = translate_term_text(TERM_INGREDIENT, item.get("name", ""), language_code, lookup)
    item["preparation"] = translate_term_text(
        TERM_PREPARATION,
        item.get("preparation", ""),
        language_code,
        lookup,
    )
    return item


def _localize_cookware(item: dict[str, Any], language_code: str, lookup) -> dict[str, Any]:
    item["name"] = translate_term_text(TERM_COOKWARE, item.get("name", ""), language_code, lookup)
    return item


def _localize_timer(item: dict[str, Any], language_code: str, lookup) -> dict[str, Any]:
    item["name"] = translate_term_text(TERM_TIMER, item.get("name", ""), language_code, lookup)
    return item


def _render_localized_step_text(step: dict[str, Any]) -> str:
    ingredients = iter(step.get("ingredients", []))
    cookware = iter(step.get("cookware", []))
    timers = iter(step.get("timers", []))

    def replace(match: re.Match[str]) -> str:
        raw = match.group(0)
        if raw.startswith("@"):
            item = next(ingredients, None)
            if item is None:
                return raw
            parts = [item.get("quantity", ""), item.get("unit", ""), item.get("name", "")]
            rendered = " ".join(part for part in parts if part)
            preparation = str(item.get("preparation", "") or "").strip()
            return f"{rendered} ({preparation})" if preparation else rendered
        if raw.startswith("#"):
            item = next(cookware, None)
            if item is None:
                return raw
            return str(item.get("name", ""))
        if raw.startswith("~"):
            item = next(timers, None)
            if item is None:
                return raw
            label = str(item.get("name", "") or "").strip()
            quantity = str(item.get("quantity", "") or "").strip()
            unit = str(item.get("unit", "") or "").strip()
            duration = " ".join(part for part in (quantity, unit) if part)
            if label and duration:
                return f"{label} ({duration})"
            return label or duration
        return raw

    return STEP_TOKEN_RE.sub(replace, step.get("raw", ""))


def localize_parsed_recipe(parsed: dict[str, Any], language_code: str) -> dict[str, Any]:
    language = normalize_language_code(language_code)
    if language == "en":
        return parsed

    localized = deepcopy(parsed)
    lookup = get_translation_lookup(language)

    localized["ingredients"] = [
        _localize_ingredient(item, language, lookup)
        for item in localized.get("ingredients", [])
    ]
    localized["cookware"] = [
        _localize_cookware(item, language, lookup)
        for item in localized.get("cookware", [])
    ]
    localized["timers"] = [
        _localize_timer(item, language, lookup)
        for item in localized.get("timers", [])
    ]

    for step in localized.get("steps", []):
        step["ingredients"] = [
            _localize_ingredient(item, language, lookup)
            for item in step.get("ingredients", [])
        ]
        step["cookware"] = [
            _localize_cookware(item, language, lookup)
            for item in step.get("cookware", [])
        ]
        step["timers"] = [
            _localize_timer(item, language, lookup)
            for item in step.get("timers", [])
        ]
        step["section"] = translate_term_text(TERM_SECTION, step.get("section", ""), language, lookup)
        step["text"] = _render_localized_step_text(step)

    return localized


def localize_combined_ingredients(
    ingredients: list[dict[str, Any]],
    language_code: str,
) -> list[dict[str, Any]]:
    language = normalize_language_code(language_code)
    if language == "en":
        return ingredients

    lookup = get_translation_lookup(language)
    localized = []
    for ingredient in ingredients:
        item = dict(ingredient)
        item["name"] = translate_term_text(TERM_INGREDIENT, item.get("name", ""), language, lookup)
        localized.append(item)
    localized.sort(key=lambda item: str(item.get("name", "")).lower())
    return localized


def get_missing_translation_counts(language_code: str) -> dict[str, Any]:
    language = normalize_language_code(language_code)
    if language == "en":
        return {
            "language": language,
            "total_missing": 0,
            "counts": {term_type: 0 for term_type in TERM_TYPES},
            "labels": TERM_TYPE_LABELS,
        }

    conn = get_db_connection()
    try:
        rows = conn.execute(
            """
            SELECT tc.term_type, COUNT(*) AS missing_count
            FROM term_catalog tc
            LEFT JOIN term_translations tt
              ON tt.term_id = tc.id
             AND tt.language_code = ?
            WHERE tt.id IS NULL
            GROUP BY tc.term_type
            """,
            (language,),
        ).fetchall()
        counts = {term_type: 0 for term_type in TERM_TYPES}
        for row in rows:
            counts[row["term_type"]] = row["missing_count"]
        return {
            "language": language,
            "total_missing": sum(counts.values()),
            "counts": counts,
            "labels": TERM_TYPE_LABELS,
        }
    finally:
        conn.close()


def _chunked(items: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _build_genai_client():
    api_key = current_app.config.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise TranslationError("GEMINI_API_KEY is not configured")

    try:
        from google import genai
    except ImportError as exc:
        raise TranslationError("google-genai is not installed") from exc

    return genai.Client(api_key=api_key)


def _translate_batch(client, language_code: str, batch: Sequence[dict[str, Any]]) -> dict[int, str]:
    payload = [
        {
            "id": item["id"],
            "term_type": item["term_type"],
            "source_text": item["source_text"],
        }
        for item in batch
    ]
    prompt = (
        f"Translate each English cooking term into {language_code}.\n"
        "Return a JSON array with one object per input item.\n"
        "Each object must contain: id, translated_text.\n"
        "Keep culinary meaning precise. Do not add explanations.\n"
        "If a term is commonly left unchanged in the target language, return the original English text.\n"
        f"Input terms:\n{json.dumps(payload, ensure_ascii=False)}"
    )
    response = client.models.generate_content(
        model=current_app.config["GEMINI_MODEL"],
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "required": ["id", "translated_text"],
                    "properties": {
                        "id": {"type": "INTEGER"},
                        "translated_text": {"type": "STRING"},
                    },
                },
            },
        },
    )

    raw_text = getattr(response, "text", "") or ""
    if not raw_text:
        raise TranslationError("Gemini returned an empty response")

    try:
        decoded = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise TranslationError("Gemini returned invalid JSON") from exc

    result: dict[int, str] = {}
    if not isinstance(decoded, list):
        raise TranslationError("Gemini response was not a JSON array")

    for item in decoded:
        if not isinstance(item, dict):
            continue
        term_id = item.get("id")
        translated_text = " ".join(str(item.get("translated_text", "")).split()).strip()
        if not isinstance(term_id, int):
            continue
        result[term_id] = translated_text
    return result


def translate_missing_terms(language_code: str, batch_size: int = 100) -> dict[str, Any]:
    language = normalize_language_code(language_code)
    if language == "en":
        return {
            "language": language,
            "requested": 0,
            "stored": 0,
            "fallback_to_english": 0,
            "failed": 0,
            "batches": 0,
        }

    conn = get_db_connection()
    try:
        missing_rows = conn.execute(
            """
            SELECT tc.id, tc.term_type, tc.source_text
            FROM term_catalog tc
            LEFT JOIN term_translations tt
              ON tt.term_id = tc.id
             AND tt.language_code = ?
            WHERE tt.id IS NULL
            ORDER BY tc.term_type, tc.source_text
            """,
            (language,),
        ).fetchall()
        if not missing_rows:
            return {
                "language": language,
                "requested": 0,
                "stored": 0,
                "fallback_to_english": 0,
                "failed": 0,
                "batches": 0,
            }

        client = _build_genai_client()

        requested = len(missing_rows)
        stored = 0
        fallback_to_english = 0
        failed = 0
        batches = 0

        missing_dicts = [dict(row) for row in missing_rows]
        for batch in _chunked(missing_dicts, batch_size):
            batches += 1
            translated = _translate_batch(client, language, batch)
            rows_to_store: list[tuple[int, str, str]] = []
            for item in batch:
                translated_text = translated.get(item["id"], "")
                if not translated_text:
                    translated_text = item["source_text"]
                    fallback_to_english += 1
                rows_to_store.append((item["id"], language, translated_text))
                stored += 1

            conn.executemany(
                """
                INSERT INTO term_translations (term_id, language_code, translated_text)
                VALUES (?, ?, ?)
                ON CONFLICT(term_id, language_code) DO UPDATE SET
                    translated_text = excluded.translated_text,
                    updated_at = CURRENT_TIMESTAMP
                """,
                rows_to_store,
            )

        conn.commit()
        failed = max(0, requested - stored)
        return {
            "language": language,
            "requested": requested,
            "stored": stored,
            "fallback_to_english": fallback_to_english,
            "failed": failed,
            "batches": batches,
        }
    finally:
        conn.close()
