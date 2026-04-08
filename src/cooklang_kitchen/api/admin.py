from flask import Blueprint, jsonify, request

from ..auth import admin_required
from ..db import get_db_connection
from ..parser import extract_recipe_fields
from ..translations import sync_term_catalog_for_source

bp = Blueprint("admin_api", __name__, url_prefix="/api")


@bp.post("/recipes")
@admin_required
def create_recipe():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    source = (data.get("source") or "").strip()

    if not source:
        return jsonify({"error": "Source is required"}), 400

    parsed_fields = extract_recipe_fields(source)
    if not title:
        title = (parsed_fields.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title is required (or provide metadata title in source)"}), 400

    description = (data.get("description") or "").strip() or (parsed_fields.get("description") or "")
    category = (data.get("category") or "Uncategorized").strip()

    conn = get_db_connection()
    cur = conn.execute(
        "INSERT INTO recipes (title, description, category, source) VALUES (?, ?, ?, ?)",
        (title, description, category, source),
    )
    sync_term_catalog_for_source(source, conn=conn)
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

    if not source:
        return jsonify({"error": "Source is required"}), 400

    parsed_fields = extract_recipe_fields(source)
    if not title:
        title = (parsed_fields.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title is required (or provide metadata title in source)"}), 400

    description = (data.get("description") or "").strip() or (parsed_fields.get("description") or "")
    category = (data.get("category") or "Uncategorized").strip()

    conn = get_db_connection()
    conn.execute(
        "UPDATE recipes SET title=?, description=?, category=?, source=? WHERE id=?",
        (title, description, category, source, recipe_id),
    )
    sync_term_catalog_for_source(source, conn=conn)
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
