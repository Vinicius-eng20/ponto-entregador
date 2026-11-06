# Migração: Render (Flask) → Cloudflare Workers (TypeScript)

Objetivo: tirar o app do Render, que hiberna no plano gratuito e leva de 30 a
60 segundos para acordar, e rodá-lo como Cloudflare Worker, que responde em
milissegundos a qualquer momento.

## Decisões

| Tema | Decisão |
|---|---|
| Linguagem / framework | TypeScript + [Hono](https://hono.dev) |
| Banco | Neon (Postgres) mantido, mesmas tabelas e dados, via Hyperdrive |
| Senhas | bcrypt (`bcryptjs`), custo 10. As senhas atuais (scrypt do Werkzeug) serão redefinidas |
| Sessão / CSRF | Cookie assinado (`HttpOnly`, `Secure`, `SameSite=Lax`) + checagem de origem |
| Migrações de banco | Arquivos `.sql` versionados em `db/migrations/` (substituem o Alembic) |
| Ambiente local | `docker-compose.workers.yml`: Postgres + `wrangler dev`. Em produção não há container |
| Logs | Workers Logs (`observability` no `wrangler.jsonc`), em JSON |
| URL final | `ponto-entregador.load1.workers.dev` (o app substitui o Worker proxy com o mesmo nome) |

## Etapas

- [x] **Fase 0 — Prova de conceito:** Hono + Hyperdrive + bcrypt no runtime do
  Workers, container local, schema SQL equivalente ao do Alembic.
- [ ] **Etapa 1 — Migração + novo frontend:** API atual traduzida para
  TypeScript; landing page pública; área logada em layout de painel (menu
  lateral, cards, gráficos); ordem: ponto → dashboard → registros; Jinja
  substituído por páginas estáticas + JS.
- [ ] **Etapa 2 — Novas funcionalidades:** paginação da API de registros (10
  por página, mais recentes primeiro); filtro de mês aberto no mês atual;
  semanas reais de domingo a sábado, incluindo dias de meses vizinhos; KPIs de
  dia mais e menos lucrativo (lucro = ganhos − custos do dia).
- [ ] **Etapa 3 — Testes:** Vitest no runtime do Workers contra o Postgres do
  container; porte dos testes atuais e testes das novas funcionalidades; CI.
- [ ] **Etapa 4 — Deploy:** GitHub Actions com `wrangler deploy`, segredos,
  Hyperdrive para o Neon, virada de URL, Render parado como plano de volta e
  remoção do código Python depois disso.

## Resultados da Fase 0

### Banco

- `db/migrations/0001_schema_inicial.sql` recria exatamente o schema do Flask:
  tabelas, tipos, checks, chave estrangeira e o índice único parcial de
  "um turno em aberto por usuário". Pode rodar mais de uma vez sem erro.
- O Worker conecta via binding `HYPERDRIVE` com o driver `pg`. No `wrangler
  dev`, a variável `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`
  aponta para o Postgres local. Isso foi testado e funciona.

### bcrypt e o limite de CPU

Tempo de CPU do `bcryptjs` medido com `npm run bench:bcrypt` (Node, mesmo
motor V8 do Workers):

| Custo | hash | compare |
|---|---|---|
| 8 | ~16 ms | ~16 ms |
| 10 | ~70 ms | ~72 ms |
| 12 | ~305 ms | ~306 ms |

O plano gratuito do Workers permite **10 ms de CPU por requisição**. Mesmo o
custo 8, abaixo do recomendado, já passa disso. Login e cadastro com bcrypt
precisam do **Workers Paid (US$ 5/mês)**, que permite até 30 s de CPU por
requisição. As demais rotas (ponto, registros, dashboard) gastam pouca CPU,
porque esperar o banco não conta.

A medição definitiva é o campo `cpuTime` no Workers Logs depois de um deploy:
o processador da Cloudflare pode ser mais rápido que a máquina do benchmark,
mas não as 7 vezes necessárias para o custo 10 caber em 10 ms.

### Rotas da prova de conceito (temporárias, saem na Etapa 1)

| Rota | O que prova |
|---|---|
| `GET /health` | Worker + Hyperdrive + Postgres conversando (503 se o banco cair) |
| `GET /poc/banco` | Leitura das tabelas atuais (`users`, `work_records`) |
| `POST /poc/bcrypt` | Hash e verificação bcrypt dentro do runtime do Workers |

## Rodando localmente

Requer Docker.

```bash
docker compose -f docker-compose.workers.yml up --build
```

O `--build` só é necessário na primeira vez ou quando `docker/workers.Dockerfile`
mudar. O `.env` da raiz pertence ao app Flask e é ignorado pelo Worker.

- App: http://localhost:8787 (teste `http://localhost:8787/health`)
- Postgres: `localhost:5433`, usuário/senha `postgres`, banco `ponto`

O schema é aplicado só na criação do volume. Para recriar o banco do zero:

```bash
docker compose -f docker-compose.workers.yml down -v
```

Sem Docker (Node 22 + Postgres local na porta 5433):

```bash
npm install
npm run dev
```
