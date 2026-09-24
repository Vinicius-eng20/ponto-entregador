import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal

from app.models import WorkRecord

MESES_PT = [
    "",
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
]


class DashboardError(Exception):
    """Erro de parâmetros inválidos para o dashboard (mês/semana fora do intervalo)."""


def get_available_months(user_id: int) -> list[dict]:
    """Meses com pelo menos um registro concluído, do mais recente ao mais antigo.

    O mês atual é sempre incluído, mesmo sem registros, para o usuário não
    encontrar o filtro "vazio" no primeiro acesso.
    """
    rows = (
        WorkRecord.query.filter(WorkRecord.user_id == user_id, WorkRecord.earnings.isnot(None))
        .with_entities(WorkRecord.date)
        .all()
    )

    months = {(d.year, d.month) for (d,) in rows}
    today = date.today()
    months.add((today.year, today.month))

    return [
        {"year": year, "month": month, "label": f"{MESES_PT[month]} de {year}"}
        for year, month in sorted(months, reverse=True)
    ]


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def weeks_in_month(year: int, month: int) -> list[dict]:
    """Divide o mês em blocos de 7 dias (1–7, 8–14, ...), para o filtro de semana."""
    last_day = calendar.monthrange(year, month)[1]
    total_weeks = -(-last_day // 7)  # arredonda para cima

    weeks = []
    for week_number in range(1, total_weeks + 1):
        start_day = (week_number - 1) * 7 + 1
        end_day = min(start_day + 6, last_day)
        weeks.append({"week": week_number, "start_day": start_day, "end_day": end_day})
    return weeks


def _week_bounds(year: int, month: int, week_number: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    start_day = (week_number - 1) * 7 + 1

    if start_day > last_day or week_number < 1:
        raise DashboardError("Semana inválida para o mês selecionado.")

    end_day = min(start_day + 6, last_day)
    return date(year, month, start_day), date(year, month, end_day)


def get_dashboard_data(user_id: int, year: int, month: int, week: int | None = None) -> dict:
    if not (1 <= month <= 12):
        raise DashboardError("Mês inválido.")

    if week:
        date_from, date_to = _week_bounds(year, month, week)
    else:
        date_from, date_to = _month_bounds(year, month)

    records = (
        WorkRecord.query.filter(
            WorkRecord.user_id == user_id,
            WorkRecord.earnings.isnot(None),
            WorkRecord.date >= date_from,
            WorkRecord.date <= date_to,
        )
        .order_by(WorkRecord.date.asc())
        .all()
    )

    total_earnings = sum((r.earnings for r in records), Decimal("0"))
    total_costs = sum((r.costs for r in records), Decimal("0"))

    worked_deltas = [r.worked_hours for r in records if r.worked_hours is not None]
    if worked_deltas:
        avg_seconds = sum(d.total_seconds() for d in worked_deltas) / len(worked_deltas)
        avg_hours, remainder = divmod(int(avg_seconds), 3600)
        avg_minutes = remainder // 60
        avg_worked_hours = f"{avg_hours:02d}:{avg_minutes:02d}"
    else:
        avg_worked_hours = None

    cost_ratio_percent = float(total_costs / total_earnings * 100) if total_earnings > 0 else None

    daily_totals: dict[date, Decimal] = defaultdict(lambda: Decimal("0"))
    for r in records:
        daily_totals[r.date] += r.earnings

    daily_earnings = [
        {"date": d.isoformat(), "date_label": d.strftime("%d/%m"), "earnings": float(v)}
        for d, v in sorted(daily_totals.items())
    ]

    return {
        "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "total_earnings": float(total_earnings),
        "total_costs": float(total_costs),
        "avg_worked_hours": avg_worked_hours,
        "cost_ratio_percent": (
            round(cost_ratio_percent, 1) if cost_ratio_percent is not None else None
        ),
        "days_worked": len(records),
        "daily_earnings": daily_earnings,
    }
