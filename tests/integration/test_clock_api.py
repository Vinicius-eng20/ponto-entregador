def test_status_requer_login(client):
    resp = client.get("/api/clock/status")
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "unauthorized"


def test_status_inicial_idle(auth_client):
    client, _user = auth_client
    resp = client.get("/api/clock/status")
    assert resp.status_code == 200
    assert resp.get_json() == {"state": "idle", "record": None}


def test_ciclo_completo_do_ponto(auth_client):
    client, _user = auth_client

    # entrada
    resp = client.post("/api/clock/in")
    assert resp.status_code == 201
    record = resp.get_json()
    assert record["end_time"] is None

    # status: working
    resp = client.get("/api/clock/status")
    assert resp.get_json()["state"] == "working"

    # segunda entrada deve falhar (409 - conflito de estado)
    resp = client.post("/api/clock/in")
    assert resp.status_code == 409

    # saída
    resp = client.post("/api/clock/out")
    assert resp.status_code == 200
    assert resp.get_json()["end_time"] is not None

    # status: awaiting_totals
    resp = client.get("/api/clock/status")
    assert resp.get_json()["state"] == "awaiting_totals"

    # fechar turno com ganhos e custos
    resp = client.post("/api/clock/close", json={"earnings": "45.90", "costs": "8.50"})
    assert resp.status_code == 200
    fechado = resp.get_json()
    assert fechado["earnings"] == 45.90
    assert fechado["costs"] == 8.50
    assert fechado["worked_hours"] is not None

    # volta a idle
    resp = client.get("/api/clock/status")
    assert resp.get_json() == {"state": "idle", "record": None}


def test_saida_sem_entrada_falha(auth_client):
    client, _user = auth_client
    resp = client.post("/api/clock/out")
    assert resp.status_code == 409


def test_fechar_turno_sem_saida_falha(auth_client):
    client, _user = auth_client
    resp = client.post("/api/clock/close", json={"earnings": "10", "costs": "1"})
    assert resp.status_code == 400


def test_fechar_turno_com_valor_invalido_falha(auth_client):
    client, _user = auth_client
    client.post("/api/clock/in")
    client.post("/api/clock/out")

    resp = client.post("/api/clock/close", json={"earnings": "abc", "costs": "1"})
    assert resp.status_code == 400
