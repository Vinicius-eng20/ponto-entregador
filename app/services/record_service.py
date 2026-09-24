from datetime import date as date_type
from datetime import datetime

from app.extensions import db
from app.models import WorkRecord
from app.services.clock_service import ClockError, _parse_money


def _parse_date(value: str) -> date_type:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ClockError("Data inválida. Use o formato AAAA-MM-DD.")


def _parse_time(value: str):
    try:
        return datetime.strptime(value, "%H:%M").time()
    except (TypeError, ValueError):
        raise ClockError("Horário inválido. Use o formato HH:MM.")


def create_manual_record(user_id: int, data: dict) -> WorkRecord:
    """Cria um registro manual completo (usado pelo botão + do calendário).

    Espera: date, start_time, end_time, earnings, costs (todos obrigatórios).
    """
    required = ["date", "start_time", "end_time", "earnings", "costs"]
    missing = [field for field in required if data.get(field) in (None, "")]
    if missing:
        raise ClockError(f"Campos obrigatórios ausentes: {', '.join(missing)}.")

    record = WorkRecord(
        user_id=user_id,
        date=_parse_date(data["date"]),
        start_time=_parse_time(data["start_time"]),
        end_time=_parse_time(data["end_time"]),
        earnings=_parse_money(data["earnings"], "ganhos"),
        costs=_parse_money(data["costs"], "custos"),
    )
    db.session.add(record)
    db.session.commit()
    return record


def list_records(user_id: int):
    return (
        WorkRecord.query.filter_by(user_id=user_id)
        .order_by(WorkRecord.date.desc(), WorkRecord.start_time.desc())
        .all()
    )


def get_record_or_404(user_id: int, record_id: int) -> WorkRecord:
    record = WorkRecord.query.filter_by(id=record_id, user_id=user_id).first()
    if record is None:
        raise ClockError("Registro não encontrado.")
    return record


def update_record(user_id: int, record_id: int, data: dict) -> WorkRecord:
    """Atualiza um registro existente. Todos os campos são obrigatórios,
    igual ao formulário de criação manual (mantém a linha sempre completa).
    """
    record = get_record_or_404(user_id, record_id)

    required = ["date", "start_time", "end_time", "earnings", "costs"]
    missing = [field for field in required if data.get(field) in (None, "")]
    if missing:
        raise ClockError(f"Campos obrigatórios ausentes: {', '.join(missing)}.")

    record.date = _parse_date(data["date"])
    record.start_time = _parse_time(data["start_time"])
    record.end_time = _parse_time(data["end_time"])
    record.earnings = _parse_money(data["earnings"], "ganhos")
    record.costs = _parse_money(data["costs"], "custos")
    db.session.commit()
    return record
