from functools import wraps
from pathlib import Path

from flask import current_app, jsonify, session
from werkzeug.security import check_password_hash


def get_password_hash() -> str | None:
    password_path = Path(current_app.config["PASSWORD_FILE"])
    if not password_path.exists():
        return None
    value = password_path.read_text(encoding="utf-8").strip()
    return value or None


def verify_password(password: str) -> bool:
    pw_hash = get_password_hash()
    if pw_hash is None:
        return True
    return check_password_hash(pw_hash, password)


def admin_required(func):
    @wraps(func)
    def decorated(*args, **kwargs):
        pw_hash = get_password_hash()
        if pw_hash is not None and not session.get("admin"):
            return jsonify({"error": "Admin login required"}), 401
        return func(*args, **kwargs)

    return decorated