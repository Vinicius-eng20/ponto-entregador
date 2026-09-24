import pytest

from app.services import clock_service
from app.services.clock_service import ClockError


def test_status_idle_quando_nao_ha_registros(app, make_user):
    user = make_user()
    with app.app_context():
        status = clock_service.get_status(user.id)

    assert status == {"state": "idle", "record": None}


def test_clock_in_cria_registro_e_muda_estado(app, make_user):
    user = make_user()
    with app.app_context():
        record = clock_service.clock_in(user.id)
        status = clock_service.get_status(user.id)

    assert record.end_time is None
    assert status["state"] == "working"
    assert status["record"]["id"] == record.id


def test_clock_in_duas_vezes_falha(app, make_user):
    user = make_user()
    with app.app_context():
        clock_service.clock_in(user.id)
        with pytest.raises(ClockError):
            clock_service.clock_in(user.id)


def test_clock_out_sem_turno_aberto_falha(app, make_user):
    user = make_user()
    with app.app_context():
        with pytest.raises(ClockError):
            clock_service.clock_out(user.id)


def test_ciclo_completo_entrada_saida_totais(app, make_user):
    user = make_user()
    with app.app_context():
        clock_service.clock_in(user.id)
        clock_service.clock_out(user.id)
        assert clock_service.get_status(user.id)["state"] == "awaiting_totals"

        record = clock_service.close_shift(user.id, "45.90", "8.50")
        assert float(record.earnings) == pytest.approx(45.90)
        assert float(record.costs) == pytest.approx(8.50)

        status_final = clock_service.get_status(user.id)
        assert status_final == {"state": "idle", "record": None}


def test_close_shift_sem_turno_aguardando_falha(app, make_user):
    user = make_user()
    with app.app_context():
        with pytest.raises(ClockError):
            clock_service.close_shift(user.id, "10.00", "1.00")


def test_close_shift_valor_negativo_falha(app, make_user):
    user = make_user()
    with app.app_context():
        clock_service.clock_in(user.id)
        clock_service.clock_out(user.id)
        with pytest.raises(ClockError):
            clock_service.close_shift(user.id, "-10.00", "1.00")
