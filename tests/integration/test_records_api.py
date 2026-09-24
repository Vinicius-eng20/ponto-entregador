PAYLOAD_VALIDO = {
    "date": "2026-09-10",
    "start_time": "09:00",
    "end_time": "13:00",
    "earnings": "50.00",
    "costs": "10.00",
}


def test_listar_registros_vazio(auth_client):
    client, _user = auth_client
    resp = client.get("/api/records")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_criar_registro_manual(auth_client):
    client, _user = auth_client
    resp = client.post("/api/records", json=PAYLOAD_VALIDO)
    assert resp.status_code == 201

    dados = resp.get_json()
    assert dados["date"] == "2026-09-10"
    assert dados["weekday"] == "Quinta-feira"
    assert dados["worked_hours"] == "04:00"
    assert dados["earnings"] == 50.0

    resp_lista = client.get("/api/records")
    assert len(resp_lista.get_json()) == 1


def test_criar_registro_com_campo_faltando_falha(auth_client):
    client, _user = auth_client
    payload = dict(PAYLOAD_VALIDO)
    del payload["earnings"]

    resp = client.post("/api/records", json=payload)
    assert resp.status_code == 400


def test_criar_registro_com_data_invalida_falha(auth_client):
    client, _user = auth_client
    payload = dict(PAYLOAD_VALIDO, date="10/09/2026")

    resp = client.post("/api/records", json=payload)
    assert resp.status_code == 400


def test_editar_registro(auth_client):
    client, _user = auth_client
    criado = client.post("/api/records", json=PAYLOAD_VALIDO).get_json()

    resp = client.put(
        f"/api/records/{criado['id']}",
        json=dict(PAYLOAD_VALIDO, earnings="99.00"),
    )
    assert resp.status_code == 200
    assert resp.get_json()["earnings"] == 99.0


def test_editar_registro_inexistente_retorna_404(auth_client):
    client, _user = auth_client
    resp = client.put("/api/records/9999", json=PAYLOAD_VALIDO)
    assert resp.status_code == 404


def test_excluir_registro(auth_client):
    client, _user = auth_client
    criado = client.post("/api/records", json=PAYLOAD_VALIDO).get_json()

    resp = client.delete(f"/api/records/{criado['id']}")
    assert resp.status_code == 204

    resp_lista = client.get("/api/records")
    assert resp_lista.get_json() == []


def test_excluir_registro_inexistente_retorna_404(auth_client):
    client, _user = auth_client
    resp = client.delete("/api/records/9999")
    assert resp.status_code == 404
