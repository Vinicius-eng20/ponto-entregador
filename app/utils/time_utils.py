from datetime import datetime

import pytz

TZ = pytz.timezone("America/Sao_Paulo")


def now_local() -> datetime:
    """Retorna o datetime atual já no fuso America/Sao_Paulo."""
    return datetime.now(TZ)


def today_local():
    """Retorna apenas a data (date) atual no fuso local."""
    return now_local().date()


def current_time_local():
    """Retorna apenas o horário (time) atual no fuso local, sem segundos."""
    return now_local().time().replace(microsecond=0)
