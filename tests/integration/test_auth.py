from app.models import User


def test_registro_cria_usuario_e_ja_loga(client, db):
    resp = client.post(
        "/register",
        data={
            "name": "Novo Entregador",
            "email": "novo@example.com",
            "password": "senha123",
            "password_confirm": "senha123",
        },
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert User.query.filter_by(email="novo@example.com").first() is not None

    resp_home = client.get("/", follow_redirects=False)
    assert resp_home.status_code == 200


def test_registro_com_senhas_diferentes_falha(client):
    resp = client.post(
        "/register",
        data={
            "name": "X",
            "email": "x@example.com",
            "password": "senha123",
            "password_confirm": "outra-senha",
        },
    )
    assert resp.status_code == 400
    assert "senhas não coincidem" in resp.get_data(as_text=True).lower()


def test_registro_com_email_duplicado_falha(client, make_user):
    make_user(email="duplicado@example.com")

    resp = client.post(
        "/register",
        data={
            "name": "Outro",
            "email": "duplicado@example.com",
            "password": "senha123",
            "password_confirm": "senha123",
        },
    )
    assert resp.status_code == 400


def test_login_com_credenciais_corretas(client, make_user):
    make_user(email="ok@example.com", password="senha123")

    resp = client.post(
        "/login",
        data={"email": "ok@example.com", "password": "senha123"},
        follow_redirects=False,
    )
    assert resp.status_code == 302


def test_login_com_senha_errada_falha(client, make_user):
    make_user(email="ok2@example.com", password="senha123")

    resp = client.post(
        "/login",
        data={"email": "ok2@example.com", "password": "senha-errada"},
    )
    assert resp.status_code == 401


def test_pagina_home_exige_login(client):
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code == 302
    assert "/login" in resp.headers["Location"]


def test_logout_encerra_sessao(auth_client):
    client, _user = auth_client

    resp = client.post("/logout", follow_redirects=False)
    assert resp.status_code == 302

    resp_home = client.get("/", follow_redirects=False)
    assert resp_home.status_code == 302
