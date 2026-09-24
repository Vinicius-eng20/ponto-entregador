def test_meses_disponiveis_inclui_mes_atual_mesmo_sem_dados(auth_client):
    client, _user = auth_client
    resp = client.get("/api/dashboard/months")
    assert resp.status_code == 200
    assert len(resp.get_json()) >= 1


def test_dashboard_requer_ano_e_mes(auth_client):
    client, _user = auth_client
    resp = client.get("/api/dashboard")
    assert resp.status_code == 400


def test_dashboard_mes_sem_registros(auth_client):
    client, _user = auth_client
    resp = client.get("/api/dashboard?year=2020&month=1")
    assert resp.status_code == 200
    dados = resp.get_json()
    assert dados["total_earnings"] == 0.0
    assert dados["daily_earnings"] == []


def test_dashboard_agrega_registros_criados_via_api(auth_client):
    client, _user = auth_client

    client.post(
        "/api/records",
        json={
            "date": "2026-09-05",
            "start_time": "09:00",
            "end_time": "13:00",
            "earnings": "50.00",
            "costs": "10.00",
        },
    )
    client.post(
        "/api/records",
        json={
            "date": "2026-09-06",
            "start_time": "09:00",
            "end_time": "15:00",
            "earnings": "80.00",
            "costs": "20.00",
        },
    )

    resp = client.get("/api/dashboard?year=2026&month=9")
    dados = resp.get_json()

    assert dados["total_earnings"] == 130.0
    assert dados["total_costs"] == 30.0
    assert dados["days_worked"] == 2
    assert len(dados["daily_earnings"]) == 2


def test_dashboard_semana_invalida_retorna_400(auth_client):
    client, _user = auth_client
    resp = client.get("/api/dashboard?year=2026&month=9&week=99")
    assert resp.status_code == 400


def test_dashboard_requer_login(client):
    resp = client.get("/api/dashboard?year=2026&month=9")
    assert resp.status_code == 401
