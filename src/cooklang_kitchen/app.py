from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from .api.admin import bp as admin_api_bp
from .api.auth import bp as auth_api_bp
from .api.recipes import bp as recipes_api_bp
from .api.translations import bp as translations_api_bp
from .config import Config
from .translations import ensure_schema
from .web import bp as web_bp


def create_app() -> Flask:
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(Config)
    # CapRover terminates TLS and proxies through nginx (one hop) — trust its
    # X-Forwarded-For so request.remote_addr is the real client IP, not the
    # proxy's. Needed for per-IP login rate limiting to work correctly.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)

    with app.app_context():
        ensure_schema()

    app.register_blueprint(web_bp)
    app.register_blueprint(auth_api_bp)
    app.register_blueprint(recipes_api_bp)
    app.register_blueprint(admin_api_bp)
    app.register_blueprint(translations_api_bp)
    return app
