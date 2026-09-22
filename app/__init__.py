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
    # Os blueprints de auth, páginas e API serão adicionados nas próximas fases
    # (auth.py, pages.py, clock.py, records.py, dashboard.py em app/routes/).
    pass
