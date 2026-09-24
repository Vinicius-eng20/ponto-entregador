PAYLOAD_VALIDO = {
    "date": "2026-09-10",
    "start_time": "09:00",
    "end_time": "13:00",
    "earnings": "50.00",
    "costs": "10.00",
}


def _login(client, email, password="senha123"):
    client.post("/login", data={"email": email, "password": password})


def test_usuario_nao_ve_registros_de_outro(client, make_user):
    user_a = make_user(email="a@example.com")
    make_user(email="b@example.com")

    _login(client, user_a.email)
    client.post("/api/records", json=PAYLOAD_VALIDO)
    client.post("/logout")

    _login(client, "b@example.com")
    resp = client.get("/api/records")
    assert resp.get_json() == []


def test_usuario_nao_edita_registro_de_outro(client, make_user):
    user_a = make_user(email="a2@example.com")
    make_user(email="b2@example.com")

    _login(client, user_a.email)
    criado = client.post("/api/records", json=PAYLOAD_VALIDO).get_json()
    client.post("/logout")

    _login(client, "b2@example.com")
    resp = client.put(f"/api/records/{criado['id']}", json=PAYLOAD_VALIDO)
    assert resp.status_code == 404


def test_usuario_nao_exclui_registro_de_outro(client, make_user):
    user_a = make_user(email="a3@example.com")
    make_user(email="b3@example.com")

    _login(client, user_a.email)
    criado = client.post("/api/records", json=PAYLOAD_VALIDO).get_json()
    client.post("/logout")

    _login(client, "b3@example.com")
    resp = client.delete(f"/api/records/{criado['id']}")
    assert resp.status_code == 404

    # o registro do usuário A continua intacto
    client.post("/logout")
    _login(client, user_a.email)
    resp_lista = client.get("/api/records")
    assert len(resp_lista.get_json()) == 1


def test_ciclo_de_ponto_e_independente_por_usuario(client, make_user):
    user_a = make_user(email="a4@example.com")
    make_user(email="b4@example.com")

    _login(client, user_a.email)
    client.post("/api/clock/in")
    client.post("/logout")

    _login(client, "b4@example.com")
    resp = client.get("/api/clock/status")
    assert resp.get_json()["state"] == "idle"
