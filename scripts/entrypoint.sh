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

if [ "$FLASK_ENV" = "development" ]; then
  echo "Subindo servidor de desenvolvimento (Flask)..."
  exec flask run --host=0.0.0.0 --port=5000 --debug
else
  echo "Subindo servidor de produção (Gunicorn)..."
  exec gunicorn wsgi:app --bind 0.0.0.0:5000 --workers 3 --access-logfile - --error-logfile -
fi
