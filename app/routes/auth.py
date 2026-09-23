from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app.extensions import db
from app.models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("pages.home"))

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        password_confirm = request.form.get("password_confirm", "")

        error = None
        if not name or not email or not password:
            error = "Preencha todos os campos."
        elif password != password_confirm:
            error = "As senhas não coincidem."
        elif len(password) < 6:
            error = "A senha deve ter pelo menos 6 caracteres."
        elif User.query.filter_by(email=email).first():
            error = "Já existe uma conta com este e-mail."

        if error:
            flash(error, "danger")
            return render_template("auth/register.html", name=name, email=email), 400

        user = User(name=name, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        login_user(user)
        flash("Conta criada com sucesso!", "success")
        return redirect(url_for("pages.home"))

    return render_template("auth/register.html")


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("pages.home"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        user = User.query.filter_by(email=email).first()
        if user is None or not user.check_password(password):
            flash("E-mail ou senha inválidos.", "danger")
            return render_template("auth/login.html", email=email), 401

        login_user(user)
        next_url = request.args.get("next")
        return redirect(next_url or url_for("pages.home"))

    return render_template("auth/login.html")


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    flash("Você saiu da sua conta.", "info")
    return redirect(url_for("auth.login"))
