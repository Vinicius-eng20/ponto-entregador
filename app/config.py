import os


def _normalize_database_url(url: str | None) -> str | None:
    """Garante que a conexão sempre use o driver psycopg2, explicitamente.

    Alguns provedores (Neon, Heroku) entregam a URL como "postgres://" ou
    "postgresql://" sem especificar o driver. Deixar em aberto é arriscado:
    versões mais novas do SQLAlchemy podem escolher outro driver por padrão
    (ex.: psycopg v3, que não instalamos), quebrando o deploy sem aviso.
    Fixando "+psycopg2" aqui, o comportamento não depende de qual driver o
    SQLAlchemy decidir usar por padrão em cada versão.
    """
    if not url:
        return url

    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    return url


class Config:
    """Configuração base, comum a todos os ambientes."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-key-insegura")
    SQLALCHEMY_DATABASE_URI = _normalize_database_url(os.environ.get("DATABASE_URL"))
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
    SQLALCHEMY_DATABASE_URI = _normalize_database_url(
        os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/ponto_test")
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
