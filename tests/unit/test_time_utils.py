from zoneinfo import ZoneInfo

from app.utils.time_utils import now_local


def test_now_local_usa_fuso_configurado(app):
    with app.app_context():
        agora = now_local()

    assert agora.tzinfo is not None
    assert agora.tzinfo.key == "America/Sao_Paulo" if isinstance(agora.tzinfo, ZoneInfo) else True


def test_now_local_retorna_horario_atual_plausivel(app):
    """Garante que o valor não é uma data fixa/mockada por engano."""
    import datetime

    with app.app_context():
        agora = now_local()

    hoje_utc = datetime.datetime.now(datetime.UTC)
    diferenca = abs((agora.astimezone(datetime.UTC) - hoje_utc).total_seconds())
    assert diferenca < 5
