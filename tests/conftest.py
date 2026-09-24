import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db as _db
from app.models import User


@pytest.fixture(scope="session")
def app():
    """Cria a aplicação uma vez por sessão de testes, com o schema já criado."""
    application = create_app(TestConfig)

    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


@pytest.fixture(autouse=True)
def _clean_database(app):
    """Limpa as tabelas antes de cada teste, mantendo os testes independentes entre si."""
    with app.app_context():
        yield
        _db.session.rollback()
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()


@pytest.fixture
def db(app):
    with app.app_context():
        yield _db


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def make_user(db):
    """Cria um usuário direto no banco (mais rápido que passar pelo endpoint de registro)."""

    def _make_user(email="usuario@example.com", password="senha123", name="Usuário de Teste"):
        user = User(email=email, name=name)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        return user

    return _make_user


@pytest.fixture
def auth_client(client, make_user):
    """Cliente já logado com um usuário padrão, pronto para chamar as rotas protegidas."""
    user = make_user()
    client.post(
        "/login",
        data={"email": user.email, "password": "senha123"},
        follow_redirects=True,
    )
    return client, user
