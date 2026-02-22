import argparse
import getpass
from pathlib import Path

from werkzeug.security import generate_password_hash

from . import create_app
from .config import Config
from .seed import create_db


def _set_password(password: str) -> None:
    password_file = Path(Config.PASSWORD_FILE)
    password_file.parent.mkdir(parents=True, exist_ok=True)
    password_file.write_text(generate_password_hash(password), encoding="utf-8")
    print(f"Admin password stored in: {password_file}")


def _remove_password() -> None:
    password_file = Path(Config.PASSWORD_FILE)
    if password_file.exists():
        password_file.unlink()
        print("Admin password removed.")
    else:
        print("No admin password file found.")


def _cmd_run(args: argparse.Namespace) -> None:
    app = create_app()
    db_path = Path(app.config["DB_PATH"])
    if args.seed_if_missing and not db_path.exists():
        create_db(db_path)

    app.run(host=args.host, port=args.port, debug=args.debug)


def _cmd_seed(_: argparse.Namespace) -> None:
    create_db(Config.DB_PATH)


def _cmd_set_password(args: argparse.Namespace) -> None:
    if args.remove:
        _remove_password()
        return

    password = args.password
    if not password:
        password = getpass.getpass("New password: ")
        confirm = getpass.getpass("Confirm:      ")
        if password != confirm:
            raise SystemExit("Error: passwords don't match.")

    if len(password) < 4:
        raise SystemExit("Error: password must be at least 4 characters.")

    _set_password(password)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cooklang-kitchen")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Run dev server")
    run.add_argument("--host", default="0.0.0.0")
    run.add_argument("--port", default=5000, type=int)
    run.add_argument("--debug", action="store_true")
    run.add_argument("--seed-if-missing", action="store_true")
    run.set_defaults(func=_cmd_run)

    seed = sub.add_parser("seed", help="Create and seed the SQLite database")
    seed.set_defaults(func=_cmd_seed)

    pw = sub.add_parser("set-password", help="Set or remove admin password")
    pw.add_argument("password", nargs="?")
    pw.add_argument("--remove", action="store_true")
    pw.set_defaults(func=_cmd_set_password)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
