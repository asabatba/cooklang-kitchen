from flask import Blueprint, jsonify, request

from ..db import get_db_connection
from ..parser import combine_ingredients, extract_recipe_fields, extract_title_description, parse
from ..translations import (
    TranslationError,
    localize_combined_ingredients,
    localize_parsed_recipe,
    normalize_language_code,
)

bp = Blueprint("recipes_api", __name__, url_prefix="/api")


@bp.get("/recipes")
def list_recipes():
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, title, description, category, source FROM recipes ORDER BY category, title"
    ).fetchall()
    conn.close()
    payload = []
    for row in rows:
        item = dict(row)
        parsed_fields = extract_recipe_fields(item["source"])
        if not (item.get("title") or "").strip():
            item["title"] = parsed_fields.get("title") or "Untitled recipe"
        if not (item.get("description") or "").strip():
            item["description"] = parsed_fields.get("description") or ""
        item.pop("source", None)
        payload.append(item)
    return jsonify(payload)


@bp.get("/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    try:
        language = normalize_language_code(request.args.get("lang", "en"))
    except TranslationError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = get_db_connection()
    row = conn.execute(
        "SELECT id, title, description, category, source FROM recipes WHERE id = ?",
        (recipe_id,),
    ).fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "Recipe not found"}), 404

    recipe_data = dict(row)
    parsed = parse(recipe_data["source"])
    title, description = extract_title_description(parsed.metadata)
    if not (recipe_data.get("title") or "").strip():
        recipe_data["title"] = title or "Untitled recipe"
    if not (recipe_data.get("description") or "").strip():
        recipe_data["description"] = description or ""
    recipe_data["parsed"] = localize_parsed_recipe(parsed.to_dict(), language)
    recipe_data["language"] = language
    return jsonify(recipe_data)


@bp.post("/combine")
def combine():
    data = request.get_json(silent=True) or {}
    raw_ids = data.get("ids", [])
    try:
        language = normalize_language_code(data.get("language", "en"))
    except TranslationError as exc:
        return jsonify({"error": str(exc)}), 400

    counts: dict[int, int] = {}
    for entry in raw_ids:
        if not isinstance(entry, dict):
            continue
        try:
            recipe_id = int(entry.get("id"))
            count = int(entry.get("count", 1))
        except (TypeError, ValueError):
            continue
        if count < 1:
            continue
        counts[recipe_id] = counts.get(recipe_id, 0) + count

    if not counts:
        return jsonify({"ingredients": []})

    conn = get_db_connection()
    placeholders = ",".join("?" * len(counts))
    rows = conn.execute(
        f"SELECT id, title, source FROM recipes WHERE id IN ({placeholders})",
        list(counts.keys()),
    ).fetchall()
    conn.close()

    all_ingredients = []
    recipe_titles = []
    for row in rows:
        parsed = parse(row["source"])
        ingredient_dicts = [i.to_dict() for i in parsed.ingredients]
        for _ in range(counts[row["id"]]):
            all_ingredients.append(ingredient_dicts)
        recipe_titles.append(row["title"])

    combined = localize_combined_ingredients(combine_ingredients(all_ingredients), language)
    return jsonify({"ingredients": combined, "recipes": recipe_titles, "language": language})
