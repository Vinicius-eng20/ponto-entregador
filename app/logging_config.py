import logging
import sys

from pythonjsonlogger import jsonlogger


def configure_logging(app):
    """Configura logs: texto legível em desenvolvimento, JSON em produção."""
    level = getattr(logging, app.config.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)

    if app.config.get("DEBUG"):
        formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    else:
        formatter = jsonlogger.JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")

    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(level)

    app.logger.setLevel(level)

    # Silencia logs muito verbosos de bibliotecas de terceiros
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
