# Migração: Render (Flask) → Cloudflare Workers (TypeScript)

Objetivo: tirar o app do Render, que hiberna no plano gratuito e leva de 30 a
60 segundos para acordar, e rodá-lo como Cloudflare Worker, que responde em
milissegundos a qualquer momento.

## Decisões

| Tema | Decisão |
|---|---|
| Linguagem / framework | TypeScript + [Hono](https://hono.dev) |
| Banco | Neon (Postgres) mantido, mesmas tabelas e dados, via Hyperdrive |
| Senhas | bcrypt (`bcryptjs`), custo 10 (variável `BCRYPT_COST`). Senhas antigas (scrypt do Werkzeug) são redefinidas com `scripts/redefinir-senha.mjs` |
| Plano Cloudflare | Gratuito (decisão da Etapa 1). Ver "bcrypt e o limite de CPU" abaixo |
| Sessão / CSRF | Cookie assinado (`HttpOnly`, `Secure`, `SameSite=Lax`) + checagem de origem |
| Migrações de banco | Arquivos `.sql` versionados em `db/migrations/` (substituem o Alembic) |
| Ambiente local | `docker-compose.workers.yml`: Postgres + `wrangler dev`. Em produção não há container |
| Logs | Workers Logs (`observability` no `wrangler.jsonc`), em JSON |
| URL final | `ponto-entregador.load1.workers.dev` (o app substitui o Worker proxy com o mesmo nome) |

## Etapas

- [x] **Fase 0 — Prova de conceito:** Hono + Hyperdrive + bcrypt no runtime do
  Workers, container local, schema SQL equivalente ao do Alembic.
- [x] **Etapa 1 — Migração + novo frontend:** API atual traduzida para
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
custo 8, abaixo do recomendado, já passa disso na medição local. As demais
rotas (ponto, registros, dashboard) gastam pouca CPU, porque esperar o banco
não conta.

**Decisão:** seguir no plano gratuito com custo 10 e medir em produção na
Etapa 4. Só cadastro e login calculam bcrypt, e a sessão dura 30 dias, então
isso acontece raramente. Se o Workers Logs mostrar `cpuTime` acima do limite
(ou erros 1102, "Worker exceeded resource limits") no login, as saídas são:
reduzir `BCRYPT_COST` em `wrangler.jsonc` (menos seguro) ou mudar para o
Workers Paid (US$ 5/mês, até 30 s de CPU por requisição).

## Arquitetura (Etapa 1)

```
navegador ──► Cloudflare Worker (Hono)
               ├─ arquivos estáticos (public/): landing, CSS, JS
               │    servidos direto, sem executar o Worker
               └─ Worker: /api/*, /app, /login, /cadastro, /health
                    └─ Hyperdrive ──► Neon (Postgres)
```

| Caminho | Conteúdo |
|---|---|
| `src/index.ts` | App Hono: logs, cabeçalhos de segurança, CSRF, rotas e erros |
| `src/routes/auth.ts` | `/api/auth/register`, `/login`, `/logout`, `/me` |
| `src/routes/api.ts` | Ponto (`/api/clock/*`), registros (`/api/records`) e dashboard (`/api/dashboard`) |
| `src/services/` | Regras de negócio, traduzidas dos `services` do Flask |
| `src/sessao.ts` | Cookie de sessão assinado (HMAC), 30 dias |
| `src/db.ts` | Uma conexão por requisição, aberta só se a rota usar o banco |
| `public/` | `index.html` (landing), `login.html`, `cadastro.html`, `app.html` (painel), CSS e JS |

A API mantém os mesmos caminhos, campos e mensagens do Flask. As páginas
passaram a ser HTML estático que consome a API, no lugar dos templates Jinja.

### Segurança

- **Sessão:** cookie `sessao` assinado com `SESSION_SECRET`, `HttpOnly`,
  `SameSite=Lax` e `Secure` em HTTPS. O cookie carrega uma impressão do hash da
  senha: redefinir a senha encerra as sessões abertas.
- **CSRF:** o middleware do Hono recusa formulários enviados de outros sites
  para `/api/*`. Chamadas JSON de outro site já são bloqueadas pelo navegador
  (exigem CORS, que o app não libera), e o cookie `SameSite=Lax` não vai em
  POST de outro site.
- **Isolamento:** toda consulta filtra por `user_id` da sessão; registro de
  outra conta responde 404.

### Migrando a sua conta do Flask

Os hashes de senha do Flask (scrypt do Werkzeug) não são verificados no
Worker: o login com eles responde "E-mail ou senha inválidos". Para cada
conta, defina uma senha nova (os registros continuam intactos):

```bash
DATABASE_URL="<connection string do Neon>" npm run redefinir-senha -- voce@email.com
```

O script pede a senha duas vezes sem mostrá-la na tela.

## Rodando localmente

Requer Docker.

```bash
docker compose -f docker-compose.workers.yml up --build
```

O `--build` só é necessário na primeira vez ou quando `docker/workers.Dockerfile`
mudar. O `.env` da raiz pertence ao app Flask e é ignorado pelo Worker.

- App: http://localhost:8787 (landing). Crie uma conta em `/cadastro`.
- Saúde do app e do banco: http://localhost:8787/health
- Postgres: `localhost:5433`, usuário/senha `postgres`, banco `ponto`

O schema é aplicado só na criação do volume. Para recriar o banco do zero:

```bash
docker compose -f docker-compose.workers.yml down -v
```

Sem Docker (Node 22 + Postgres local na porta 5433):

```bash
npm install
cp .dev.vars.example .dev.vars   # e troque o SESSION_SECRET
npm run dev
```

Com o `.dev.vars` presente, o `wrangler` deixa de ler o `.env` do Flask.
