import os


class Config:
    """Configuração base, comum a todos os ambientes."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-key-insegura")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    TIMEZONE = os.environ.get("TZ", "America/Sao_Paulo")
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"


class DevConfig(Config):
    DEBUG = True
    SESSION_COOKIE_SECURE = False


class TestConfig(Config):
    TESTING = True
    DEBUG = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/ponto_test"
    )
    SESSION_COOKIE_SECURE = False


class ProdConfig(Config):
    DEBUG = False
    SESSION_COOKIE_SECURE = True


config_by_name = {
    "development": DevConfig,
    "testing": TestConfig,
    "production": ProdConfig,
}


def get_config():
    env = os.environ.get("FLASK_ENV", "development")
    return config_by_name.get(env, DevConfig)
