# Imagem de desenvolvimento local da versão Cloudflare Workers.
# Usada só pelo docker-compose.workers.yml; em produção o app roda como
# Worker, sem container.
FROM node:22-bookworm-slim

# O runtime do Workers (workerd) não inicia sem os certificados raiz do
# sistema, e a imagem "slim" não os traz.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
