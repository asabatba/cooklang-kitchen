import sqlite3
from pathlib import Path

from flask import current_app


def ensure_data_dir() -> None:
    db_path = Path(current_app.config["DB_PATH"])
    db_path.parent.mkdir(parents=True, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    ensure_data_dir()
    conn = sqlite3.connect(current_app.config["DB_PATH"])
    conn.row_factory = sqlite3.Row
    return conn