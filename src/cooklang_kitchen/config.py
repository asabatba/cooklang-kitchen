import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data")).resolve()


def _data_file(name: str, default_name: str) -> str:
    explicit = os.environ.get(name)
    if explicit:
        return explicit
    return str(DATA_DIR / default_name)


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    DB_PATH = _data_file("DB_PATH", "recipes.db")
    PASSWORD_FILE = _data_file("PASSWORD_FILE", ".admin_password")
