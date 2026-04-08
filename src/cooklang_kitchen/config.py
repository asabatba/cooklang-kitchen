import os
import secrets
from datetime import timedelta
from pathlib import Path
from typing import Final

DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data")).resolve()
DEFAULT_SECRET_FILE: Final[str] = ".secret_key"


def _data_file(name: str, default_name: str) -> str:
    explicit = os.environ.get(name)
    if explicit:
        return explicit
    return str(DATA_DIR / default_name)


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    value = os.environ.get(name)
    if value is None:
        return list(default)

    result: list[str] = []
    seen: set[str] = set()
    for item in value.split(","):
        code = item.strip().lower()
        if not code or code in seen:
            continue
        seen.add(code)
        result.append(code)
    return result or list(default)


def _load_or_create_secret_key() -> str:
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        return env_key

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    secret_file = Path(_data_file("SECRET_FILE", DEFAULT_SECRET_FILE))

    if secret_file.exists():
        value = secret_file.read_text(encoding="utf-8").strip()
        if value:
            return value

    # Avoid race conditions across multiple workers/processes.
    candidate = secrets.token_hex(32)
    try:
        with secret_file.open("x", encoding="utf-8") as f:
            f.write(candidate)
        return candidate
    except FileExistsError:
        value = secret_file.read_text(encoding="utf-8").strip()
        if value:
            return value
        secret_file.write_text(candidate, encoding="utf-8")
        return candidate


class Config:
    SECRET_KEY = _load_or_create_secret_key()
    DB_PATH = _data_file("DB_PATH", "recipes.db")
    PASSWORD_FILE = _data_file("PASSWORD_FILE", ".admin_password")
    SECRET_FILE = _data_file("SECRET_FILE", DEFAULT_SECRET_FILE)
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    TRANSLATION_LANGUAGES = [
        "en",
        *[
            code
            for code in _env_list("TRANSLATION_LANGUAGES", ["en"])
            if code != "en"
        ],
    ]

    SESSION_COOKIE_NAME = os.environ.get("SESSION_COOKIE_NAME", "cooklang_session")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", False)
    PERMANENT_SESSION_LIFETIME = timedelta(days=int(os.environ.get("SESSION_DAYS", "14")))
