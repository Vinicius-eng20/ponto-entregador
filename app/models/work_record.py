from datetime import UTC, datetime, timedelta

from app.extensions import db

DIAS_SEMANA_PT = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo",
]


class WorkRecord(db.Model):
    __tablename__ = "work_records"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    date = db.Column(db.Date, nullable=False, index=True)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=True)

    earnings = db.Column(db.Numeric(10, 2), nullable=True)
    costs = db.Column(db.Numeric(10, 2), nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        db.CheckConstraint("earnings IS NULL OR earnings >= 0", name="ck_earnings_non_negative"),
        db.CheckConstraint("costs IS NULL OR costs >= 0", name="ck_costs_non_negative"),
        # Garante um único turno em aberto por usuário
        db.Index(
            "ux_open_shift_per_user",
            "user_id",
            unique=True,
            postgresql_where=db.text("end_time IS NULL"),
        ),
    )

    @property
    def weekday_name(self) -> str:
        return DIAS_SEMANA_PT[self.date.weekday()]

    @property
    def worked_hours(self):
        """Retorna a duração do turno como timedelta, ou None se ainda estiver aberto.

        Se end_time < start_time, considera que o turno passou da meia-noite.
        """
        if self.end_time is None:
            return None

        start = datetime.combine(self.date, self.start_time)
        end = datetime.combine(self.date, self.end_time)

        if end < start:
            end += timedelta(days=1)

        return end - start

    @property
    def worked_hours_formatted(self):
        """Formata a duração como HH:MM, no mesmo estilo da planilha atual."""
        delta = self.worked_hours
        if delta is None:
            return None
        total_minutes = int(delta.total_seconds() // 60)
        hours, minutes = divmod(total_minutes, 60)
        return f"{hours:02d}:{minutes:02d}"

    @property
    def is_open(self) -> bool:
        return self.end_time is None

    @property
    def is_awaiting_totals(self) -> bool:
        return self.end_time is not None and self.earnings is None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "weekday": self.weekday_name,
            "start_time": self.start_time.strftime("%H:%M") if self.start_time else None,
            "end_time": self.end_time.strftime("%H:%M") if self.end_time else None,
            "earnings": float(self.earnings) if self.earnings is not None else None,
            "costs": float(self.costs) if self.costs is not None else None,
            "worked_hours": self.worked_hours_formatted,
        }

    def __repr__(self) -> str:
        return f"<WorkRecord {self.date} user={self.user_id}>"
