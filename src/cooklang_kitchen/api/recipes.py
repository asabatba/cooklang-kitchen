from flask import Blueprint, jsonify, request

from ..db import get_db_connection
from ..parser import combine_ingredients, extract_recipe_fields, parse
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
    parsed_fields = extract_recipe_fields(recipe_data["source"])
    if not (recipe_data.get("title") or "").strip():
        recipe_data["title"] = parsed_fields.get("title") or "Untitled recipe"
    if not (recipe_data.get("description") or "").strip():
        recipe_data["description"] = parsed_fields.get("description") or ""
    recipe_data["parsed"] = localize_parsed_recipe(parse(recipe_data["source"]).to_dict(), language)
    recipe_data["language"] = language
    return jsonify(recipe_data)


@bp.post("/combine")
def combine():
    data = request.get_json(silent=True) or {}
    recipe_ids = data.get("ids", [])
    try:
        language = normalize_language_code(data.get("language", "en"))
    except TranslationError as exc:
        return jsonify({"error": str(exc)}), 400

    if not recipe_ids:
        return jsonify({"ingredients": []})

    conn = get_db_connection()
    placeholders = ",".join("?" * len(recipe_ids))
    rows = conn.execute(
        f"SELECT id, title, source FROM recipes WHERE id IN ({placeholders})",
        recipe_ids,
    ).fetchall()
    conn.close()

    all_ingredients = []
    recipe_titles = []
    for row in rows:
        parsed = parse(row["source"])
        all_ingredients.append([i.to_dict() for i in parsed.ingredients])
        recipe_titles.append(row["title"])

    combined = localize_combined_ingredients(combine_ingredients(all_ingredients), language)
    return jsonify({"ingredients": combined, "recipes": recipe_titles, "language": language})
