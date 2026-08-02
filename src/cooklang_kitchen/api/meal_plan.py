from flask import Blueprint, jsonify, request

from ..auth import admin_required
from ..db import get_db_connection

VALID_SLOTS = ("lunch", "dinner")

bp = Blueprint("meal_plan_api", __name__, url_prefix="/api/meal-plan")


@bp.get("")
def list_entries():
    start = request.args.get("start", "")
    end = request.args.get("end", "")
    if not start or not end:
        return jsonify({"error": "start and end query params are required"}), 400

    conn = get_db_connection()
    rows = conn.execute(
        "SELECT date, slot, recipe_id FROM meal_plan_entries WHERE date BETWEEN ? AND ? ORDER BY date, slot",
        (start, end),
    ).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@bp.put("/<date>/<slot>")
@admin_required
def assign_slot(date: str, slot: str):
    if slot not in VALID_SLOTS:
        return jsonify({"error": f"slot must be one of {VALID_SLOTS}"}), 400

    data = request.get_json(silent=True) or {}
    try:
        recipe_id = int(data.get("recipe_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "recipe_id is required"}), 400

    conn = get_db_connection()
    recipe = conn.execute("SELECT id FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not recipe:
        conn.close()
        return jsonify({"error": "Recipe not found"}), 404

    conn.execute(
        """
        INSERT INTO meal_plan_entries (date, slot, recipe_id) VALUES (?, ?, ?)
        ON CONFLICT(date, slot) DO UPDATE SET recipe_id = excluded.recipe_id
        """,
        (date, slot, recipe_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"date": date, "slot": slot, "recipe_id": recipe_id})


@bp.delete("/<date>/<slot>")
@admin_required
def clear_slot(date: str, slot: str):
    if slot not in VALID_SLOTS:
        return jsonify({"error": f"slot must be one of {VALID_SLOTS}"}), 400

    conn = get_db_connection()
    conn.execute("DELETE FROM meal_plan_entries WHERE date = ? AND slot = ?", (date, slot))
    conn.commit()
    conn.close()
    return jsonify({"date": date, "slot": slot, "cleared": True})
