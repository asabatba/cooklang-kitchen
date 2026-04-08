from flask import Blueprint, current_app, render_template

bp = Blueprint("web", __name__)


@bp.get("/")
def index():
    return render_template(
        "index.html",
        app_config={
            "translationLanguages": current_app.config["TRANSLATION_LANGUAGES"],
        },
    )


@bp.get("/healthz")
def healthz():
    return {"status": "ok"}
