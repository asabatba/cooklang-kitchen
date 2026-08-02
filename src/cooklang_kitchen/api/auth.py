from flask import Blueprint, jsonify, request, session

from ..auth import get_password_hash, verify_password
from ..rate_limit import is_locked_out, record_failure, record_success

bp = Blueprint("auth_api", __name__, url_prefix="/api/auth")


@bp.get("/status")
def auth_status():
    pw_hash = get_password_hash()
    return jsonify(
        {"password_set": pw_hash is not None, "logged_in": bool(session.get("admin"))}
    )


@bp.post("/login")
def login():
    client_key = request.remote_addr or "unknown"
    locked_out, retry_after = is_locked_out(client_key)
    if locked_out:
        response = jsonify({"error": "Too many failed login attempts. Try again later."})
        response.status_code = 429
        response.headers["Retry-After"] = str(int(retry_after) + 1)
        return response

    if get_password_hash() is None:
        return jsonify(
            {"error": "Admin password not configured. Run cooklang-kitchen set-password first."}
        ), 503

    data = request.get_json(silent=True) or {}
    password = data.get("password", "")

    if verify_password(password):
        record_success(client_key)
        session.permanent = True
        session["admin"] = True
        session.modified = True
        return jsonify({"ok": True})

    record_failure(client_key)
    return jsonify({"error": "Wrong password"}), 403


@bp.post("/logout")
def logout():
    session.pop("admin", None)
    return jsonify({"ok": True})
