from flask import jsonify, render_template, request


def register_error_handlers(app):
    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith("/api/"):
            return jsonify(error="not_found", message="Recurso não encontrado."), 404
        return render_template("errors/404.html"), 404

    @app.errorhandler(500)
    def internal_error(error):
        app.logger.exception("Erro interno não tratado")
        if request.path.startswith("/api/"):
            return jsonify(error="internal_error", message="Erro interno do servidor."), 500
        return render_template("errors/500.html"), 500
