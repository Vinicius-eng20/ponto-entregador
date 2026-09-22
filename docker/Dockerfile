FROM python:3.12-slim

# Evita .pyc e garante logs sem buffer (aparecem em tempo real)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Sao_Paulo \
    FLASK_APP=wsgi.py

WORKDIR /app

# Dependências de sistema mínimas (psycopg2 precisa de libpq)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-dev.txt

COPY . .

RUN chmod +x scripts/entrypoint.sh

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["./scripts/entrypoint.sh"]
