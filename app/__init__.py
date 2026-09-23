from flask import Flask, jsonify

from app.config import get_config
from app.extensions import csrf, db, login_manager, migrate
from app.logging_config import configure_logging
from app.utils.errors import register_error_handlers


def create_app(config_object=None):
    app = Flask(__name__)
    app.config.from_object(config_object or get_config())

    configure_logging(app)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)

    from app.models import User, WorkRecord  # noqa: F401 (registra os modelos no SQLAlchemy)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    register_error_handlers(app)
    register_blueprints(app)

    @app.get("/health")
    def health():
        return jsonify(status="ok"), 200

    return app


def register_blueprints(app):
    from app.routes.auth import auth_bp
    from app.routes.clock import clock_bp
    from app.routes.pages import pages_bp
    from app.routes.records import records_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(clock_bp)
    app.register_blueprint(records_bp)

    # O blueprint de dashboard (app/routes/dashboard.py) será adicionado na Fase 3.
