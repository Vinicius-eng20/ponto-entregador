#!/bin/sh
set -e

echo "Aguardando o banco de dados ficar disponível..."
until python -c "
import os, sys, psycopg2
try:
    psycopg2.connect(os.environ['DATABASE_URL'])
except Exception as e:
    sys.exit(1)
"; do
  sleep 1
done
echo "Banco disponível."

echo "Aplicando migrations..."
flask db upgrade

# O Render (e outras plataformas de deploy) informam a porta via $PORT.
# Localmente, sem essa variável, cai no 5000 de sempre.
PORT="${PORT:-5000}"

if [ "$FLASK_ENV" = "development" ]; then
  echo "Subindo servidor de desenvolvimento (Flask) na porta $PORT..."
  exec flask run --host=0.0.0.0 --port="$PORT" --debug
else
  echo "Subindo servidor de produção (Gunicorn) na porta $PORT..."
  exec gunicorn wsgi:app --bind "0.0.0.0:$PORT" --workers 3 --access-logfile - --error-logfile -
fi
