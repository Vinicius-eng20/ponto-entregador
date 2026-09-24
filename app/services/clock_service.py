from decimal import Decimal, InvalidOperation

from app.extensions import db
from app.models import WorkRecord
from app.utils.time_utils import current_time_local, today_local


class ClockError(Exception):
    """Erro de regra de negócio do ponto (estado inválido, dados inválidos etc.)."""


def get_open_record(user_id: int) -> WorkRecord | None:
    """Retorna o turno em aberto (sem saída) do usuário, se existir."""
    return (
        WorkRecord.query.filter_by(user_id=user_id, end_time=None)
        .order_by(WorkRecord.id.desc())
        .first()
    )


def get_awaiting_totals_record(user_id: int) -> WorkRecord | None:
    """Retorna o turno que já tem saída mas ainda não tem ganhos/custos."""
    return (
        WorkRecord.query.filter(
            WorkRecord.user_id == user_id,
            WorkRecord.end_time.isnot(None),
            WorkRecord.earnings.is_(None),
        )
        .order_by(WorkRecord.id.desc())
        .first()
    )


def get_status(user_id: int) -> dict:
    """Calcula o estado atual do ciclo do ponto para o usuário.

    Estados possíveis: idle, working, awaiting_totals.
    """
    open_record = get_open_record(user_id)
    if open_record:
        return {"state": "working", "record": open_record.to_dict()}

    awaiting = get_awaiting_totals_record(user_id)
    if awaiting:
        return {"state": "awaiting_totals", "record": awaiting.to_dict()}

    return {"state": "idle", "record": None}


def clock_in(user_id: int) -> WorkRecord:
    """Registra a entrada: cria um novo registro com data e hora atuais."""
    if get_open_record(user_id):
        raise ClockError(
            "Já existe um turno em aberto. Registre a saída antes de uma nova entrada."
        )

    if get_awaiting_totals_record(user_id):
        raise ClockError(
            "Existe um turno aguardando ganhos e custos. Conclua-o antes de iniciar outro."
        )

    record = WorkRecord(
        user_id=user_id,
        date=today_local(),
        start_time=current_time_local(),
    )
    db.session.add(record)
    db.session.commit()
    return record


def clock_out(user_id: int) -> WorkRecord:
    """Registra a saída no turno em aberto."""
    record = get_open_record(user_id)
    if record is None:
        raise ClockError("Não há turno em aberto para registrar a saída.")

    record.end_time = current_time_local()
    db.session.commit()
    return record


def _parse_money(value, field_name: str) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ClockError(f"O campo '{field_name}' deve ser um número válido.") from None

    if amount < 0:
        raise ClockError(f"O campo '{field_name}' não pode ser negativo.")

    return amount


def close_shift(user_id: int, earnings, costs) -> WorkRecord:
    """Conclui o ciclo: grava ganhos e custos no turno que aguarda totais."""
    record = get_awaiting_totals_record(user_id)
    if record is None:
        raise ClockError("Não há turno aguardando ganhos e custos.")

    record.earnings = _parse_money(earnings, "ganhos")
    record.costs = _parse_money(costs, "custos")
    db.session.commit()
    return record
