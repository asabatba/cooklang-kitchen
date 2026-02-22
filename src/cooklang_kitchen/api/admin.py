from flask import Blueprint, jsonify, request

from ..auth import admin_required
from ..db import get_db_connection

bp = Blueprint("admin_api", __name__, url_prefix="/api")


@bp.post("/recipes")
@admin_required
def create_recipe():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    source = (data.get("source") or "").strip()

    if not title or not source:
        return jsonify({"error": "Title and source are required"}), 400

    description = (data.get("description") or "").strip()
    category = (data.get("category") or "Uncategorized").strip()

    conn = get_db_connection()
    cur = conn.execute(
        "INSERT INTO recipes (title, description, category, source) VALUES (?, ?, ?, ?)",
        (title, description, category, source),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()

    return jsonify({"id": new_id, "title": title}), 201


@bp.put("/recipes/<int:recipe_id>")
@admin_required
def update_recipe(recipe_id: int):
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    source = (data.get("source") or "").strip()

    if not title or not source:
        return jsonify({"error": "Title and source are required"}), 400

    description = (data.get("description") or "").strip()
    category = (data.get("category") or "Uncategorized").strip()

    conn = get_db_connection()
    conn.execute(
        "UPDATE recipes SET title=?, description=?, category=?, source=? WHERE id=?",
        (title, description, category, source, recipe_id),
    )
    conn.commit()
    conn.close()

    return jsonify({"id": recipe_id, "title": title})


@bp.delete("/recipes/<int:recipe_id>")
@admin_required
def delete_recipe(recipe_id: int):
    conn = get_db_connection()
    conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": recipe_id})
