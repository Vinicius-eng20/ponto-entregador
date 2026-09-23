from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.services import clock_service
from app.services.clock_service import ClockError

clock_bp = Blueprint("clock", __name__, url_prefix="/api/clock")


@clock_bp.get("/status")
@login_required
def status():
    return jsonify(clock_service.get_status(current_user.id))


@clock_bp.post("/in")
@login_required
def clock_in():
    try:
        record = clock_service.clock_in(current_user.id)
    except ClockError as exc:
        return jsonify(error="invalid_state", message=str(exc)), 409

    return jsonify(record.to_dict()), 201


@clock_bp.post("/out")
@login_required
def clock_out():
    try:
        record = clock_service.clock_out(current_user.id)
    except ClockError as exc:
        return jsonify(error="invalid_state", message=str(exc)), 409

    return jsonify(record.to_dict())


@clock_bp.post("/close")
@login_required
def close_shift():
    data = request.get_json(silent=True) or {}
    try:
        record = clock_service.close_shift(
            current_user.id, data.get("earnings"), data.get("costs")
        )
    except ClockError as exc:
        return jsonify(error="invalid_data", message=str(exc)), 400

    return jsonify(record.to_dict())
