from flask import Blueprint, jsonify, request

from ..db import get_db_connection
from ..parser import combine_ingredients, parse

bp = Blueprint("recipes_api", __name__, url_prefix="/api")


@bp.get("/recipes")
def list_recipes():
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, title, description, category FROM recipes ORDER BY category, title"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@bp.get("/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id, title, description, category, source FROM recipes WHERE id = ?",
        (recipe_id,),
    ).fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "Recipe not found"}), 404

    recipe_data = dict(row)
    recipe_data["parsed"] = parse(recipe_data["source"]).to_dict()
    return jsonify(recipe_data)


@bp.post("/combine")
def combine():
    data = request.get_json(silent=True) or {}
    recipe_ids = data.get("ids", [])

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

    combined = combine_ingredients(all_ingredients)
    return jsonify({"ingredients": combined, "recipes": recipe_titles})
