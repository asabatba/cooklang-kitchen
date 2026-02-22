from flask import Blueprint, jsonify, request, session

from ..auth import get_password_hash, verify_password

bp = Blueprint("auth_api", __name__, url_prefix="/api/auth")


@bp.get("/status")
def auth_status():
    pw_hash = get_password_hash()
    return jsonify(
        {"password_set": pw_hash is not None, "logged_in": bool(session.get("admin"))}
    )


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")

    if verify_password(password):
        session["admin"] = True
        return jsonify({"ok": True})

    return jsonify({"error": "Wrong password"}), 403


@bp.post("/logout")
def logout():
    session.pop("admin", None)
    return jsonify({"ok": True})
