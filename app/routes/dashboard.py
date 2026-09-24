from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.services import dashboard_service
from app.services.dashboard_service import DashboardError

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dashboard_bp.get("/months")
@login_required
def months():
    return jsonify(dashboard_service.get_available_months(current_user.id))


@dashboard_bp.get("")
@login_required
def data():
    try:
        year = int(request.args.get("year"))
        month = int(request.args.get("month"))
    except (TypeError, ValueError):
        return jsonify(error="invalid_params", message="Informe ano e mês válidos."), 400

    week_raw = request.args.get("week")
    week = None
    if week_raw:
        try:
            week = int(week_raw)
        except ValueError:
            return jsonify(error="invalid_params", message="Semana inválida."), 400

    try:
        result = dashboard_service.get_dashboard_data(current_user.id, year, month, week)
    except DashboardError as exc:
        return jsonify(error="invalid_params", message=str(exc)), 400

    return jsonify(result)
