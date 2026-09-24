from decimal import Decimal

import pytest

from app.extensions import db
from app.models import WorkRecord
from app.services import dashboard_service
from app.services.dashboard_service import DashboardError


def _criar_registro(user_id, date_, start, end, earnings, costs):
    import datetime

    record = WorkRecord(
        user_id=user_id,
        date=datetime.date.fromisoformat(date_),
        start_time=datetime.time.fromisoformat(start),
        end_time=datetime.time.fromisoformat(end),
        earnings=Decimal(earnings),
        costs=Decimal(costs),
    )
    db.session.add(record)
    db.session.commit()
    return record


def test_weeks_in_month_setembro_tem_cinco_semanas():
    semanas = dashboard_service.weeks_in_month(2026, 9)
    # Setembro de 2026 tem 30 dias -> semanas de 1-7, 8-14, 15-21, 22-28, 29-30
    assert [s["week"] for s in semanas] == [1, 2, 3, 4, 5]
    assert semanas[-1] == {"week": 5, "start_day": 29, "end_day": 30}


def test_weeks_in_month_fevereiro_nao_bissexto():
    semanas = dashboard_service.weeks_in_month(2026, 2)
    assert semanas[-1]["end_day"] == 28


def test_dashboard_mes_inteiro_agrega_todos_os_registros(app, make_user):
    user = make_user()
    with app.app_context():
        _criar_registro(user.id, "2026-09-01", "09:00", "13:00", "50.00", "10.00")
        _criar_registro(user.id, "2026-09-20", "09:00", "14:00", "70.00", "15.00")

        dados = dashboard_service.get_dashboard_data(user.id, 2026, 9)

        assert dados["total_earnings"] == pytest.approx(120.0)
        assert dados["total_costs"] == pytest.approx(25.0)
        assert dados["days_worked"] == 2
        assert dados["cost_ratio_percent"] == pytest.approx(25 / 120 * 100, abs=0.1)
        assert len(dados["daily_earnings"]) == 2


def test_dashboard_filtra_por_semana(app, make_user):
    user = make_user()
    with app.app_context():
        _criar_registro(user.id, "2026-09-01", "09:00", "13:00", "50.00", "10.00")  # semana 1
        _criar_registro(user.id, "2026-09-10", "09:00", "14:00", "70.00", "15.00")  # semana 2

        dados_semana_1 = dashboard_service.get_dashboard_data(user.id, 2026, 9, week=1)
        dados_semana_2 = dashboard_service.get_dashboard_data(user.id, 2026, 9, week=2)

        assert dados_semana_1["total_earnings"] == pytest.approx(50.0)
        assert dados_semana_2["total_earnings"] == pytest.approx(70.0)


def test_dashboard_semana_invalida_lanca_erro(app, make_user):
    user = make_user()
    with app.app_context():
        with pytest.raises(DashboardError):
            dashboard_service.get_dashboard_data(user.id, 2026, 9, week=99)


def test_dashboard_sem_registros_retorna_zeros_sem_quebrar(app, make_user):
    user = make_user()
    with app.app_context():
        dados = dashboard_service.get_dashboard_data(user.id, 2026, 1)

    assert dados["total_earnings"] == 0.0
    assert dados["total_costs"] == 0.0
    assert dados["cost_ratio_percent"] is None
    assert dados["avg_worked_hours"] is None
    assert dados["daily_earnings"] == []


def test_dashboard_turno_em_aberto_nao_entra_nas_contas(app, make_user):
    """Um turno sem ganhos/custos preenchidos não deve contaminar os totais."""
    import datetime as dt

    user = make_user()
    with app.app_context():
        from app.services import clock_service

        clock_service.clock_in(user.id)  # fica em aberto, sem earnings

        hoje = dt.date.today()
        dados = dashboard_service.get_dashboard_data(user.id, hoje.year, hoje.month)

    assert dados["total_earnings"] == 0.0
    assert dados["days_worked"] == 0
