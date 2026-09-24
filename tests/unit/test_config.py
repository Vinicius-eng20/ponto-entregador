from app.config import _normalize_database_url


def test_normaliza_url_postgres_legado_para_psycopg2():
    url = _normalize_database_url("postgres://user:pass@host/db")
    assert url == "postgresql+psycopg2://user:pass@host/db"


def test_normaliza_url_postgresql_para_psycopg2():
    url = _normalize_database_url("postgresql://user:pass@host/db?sslmode=require")
    assert url == "postgresql+psycopg2://user:pass@host/db?sslmode=require"


def test_nao_mexe_em_url_que_ja_tem_driver_explicito():
    url = _normalize_database_url("postgresql+psycopg2://user:pass@host/db")
    assert url == "postgresql+psycopg2://user:pass@host/db"


def test_url_vazia_ou_none_retorna_como_veio():
    assert _normalize_database_url(None) is None
    assert _normalize_database_url("") == ""
