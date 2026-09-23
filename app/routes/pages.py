from flask import Blueprint, render_template
from flask_login import current_user, login_required

from app.services import clock_service
from app.services.record_service import list_records
from app.utils.time_utils import today_local

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
@login_required
def home():
    status = clock_service.get_status(current_user.id)
    records = list_records(current_user.id)
    return render_template(
        "home.html",
        status=status,
        today=today_local(),
        records=records,
    )
