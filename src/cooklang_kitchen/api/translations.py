from flask import Blueprint, jsonify, request

from ..auth import admin_required
from ..translations import (
    TranslationError,
    get_missing_translation_counts,
    translate_missing_terms,
)

bp = Blueprint("translations_api", __name__, url_prefix="/api/translations")


@bp.get("/missing")
@admin_required
def missing_translations():
    language = request.args.get("language", "en")
    try:
        return jsonify(get_missing_translation_counts(language))
    except TranslationError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.post("/update-missing")
@admin_required
def update_missing_translations():
    data = request.get_json(silent=True) or {}
    language = data.get("language", "en")
    try:
        return jsonify(translate_missing_terms(language))
    except TranslationError as exc:
        status = 503 if "GEMINI_" in str(exc) or "google-genai" in str(exc) else 400
        return jsonify({"error": str(exc)}), status
