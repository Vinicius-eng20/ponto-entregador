from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import WorkRecord
from app.services.clock_service import ClockError
from app.services.record_service import create_manual_record, list_records, update_record

records_bp = Blueprint("records", __name__, url_prefix="/api/records")


@records_bp.get("")
@login_required
def index():
    records = list_records(current_user.id)
    return jsonify([r.to_dict() for r in records])


@records_bp.post("")
@login_required
def create():
    data = request.get_json(silent=True) or {}
    try:
        record = create_manual_record(current_user.id, data)
    except ClockError as exc:
        return jsonify(error="invalid_data", message=str(exc)), 400

    return jsonify(record.to_dict()), 201


@records_bp.put("/<int:record_id>")
@login_required
def update(record_id: int):
    data = request.get_json(silent=True) or {}
    try:
        record = update_record(current_user.id, record_id, data)
    except ClockError as exc:
        status_code = 404 if "não encontrado" in str(exc) else 400
        return jsonify(error="invalid_data", message=str(exc)), status_code

    return jsonify(record.to_dict())


@records_bp.delete("/<int:record_id>")
@login_required
def delete(record_id: int):
    record = WorkRecord.query.filter_by(id=record_id, user_id=current_user.id).first()
    if record is None:
        return jsonify(error="not_found", message="Registro não encontrado."), 404

    db.session.delete(record)
    db.session.commit()
    return "", 204
