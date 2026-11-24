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
- [x] **Etapa 2 — Novas funcionalidades:** paginação da API de registros (10
  por página, mais recentes primeiro); filtro de mês aberto no mês atual;
  semanas reais de domingo a sábado, incluindo dias de meses vizinhos; KPIs de
  dia mais e menos lucrativo (lucro = ganhos − custos do dia).
- [x] **Etapa 3 — Testes:** Vitest no runtime do Workers contra o Postgres do
  container; porte dos testes atuais e testes das novas funcionalidades; CI.
- [ ] **Etapa 4 — Deploy:** GitHub Actions com `wrangler deploy`, segredos,
  Hyperdrive para o Neon, virada de URL, Render parado como plano de volta e
  remoção do código Python depois disso. Código pronto; falta executar o
  [passo a passo](#etapa-4--deploy-passo-a-passo) e, depois de 1 a 2 semanas
  sem problemas, remover o Flask.

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
npm run redefinir-senha
```

O script pergunta a connection string do Neon, o e-mail da conta e a nova
senha duas vezes, sem mostrar a connection string nem a senha na tela.
Funciona em qualquer terminal (PowerShell, cmd, Git Bash, Linux, macOS).

Depois disso, o login dessa conta no app Flask para de funcionar (o Flask
não confere bcrypt).

## Mudanças da Etapa 2 na API

| Rota | Mudança |
|---|---|
| `GET /api/records?page=N` | Passa a ser paginada: 10 por página, ordenada por data, entrada e id (decrescente). Responde `{ items, page, per_page, total, total_pages }` em vez de uma lista. Página além da última: `items` vazio. `page` inválido: 400 |
| `GET /api/dashboard` | `week` agora é o número da semana real (domingo a sábado) na lista `weeks` do próprio retorno, e pode incluir dias de meses vizinhos. Novos campos: `weeks`, `week`, `total_profit`, `most_profitable_day` e `least_profitable_day` (`date`, `weekday`, `earnings`, `costs`, `profit`; `null` sem turnos) e `profit` em `daily_earnings` |

No painel, o filtro de mês abre no mês atual, e a tabela de registros ganhou
paginação.

### Banco

`db/migrations/0002_indice_registros_por_data.sql` cria o índice usado pela
listagem paginada. O container local aplica sozinho na criação do volume; para
um volume já existente, ou no Neon antes do deploy:

```bash
npm run migrar
```

O script pergunta a connection string (ou usa `DATABASE_URL`) e aplica todos
os arquivos de `db/migrations`, em ordem. Como as migrações usam
`IF NOT EXISTS`, rodar de novo não muda nada. Não precisa do `psql`.

## Testes

Vitest rodando **dentro do runtime do Workers** (`@cloudflare/vitest-plugin`),
contra um Postgres de verdade. As requisições passam pelo Worker inteiro
(middlewares, sessão, CSRF, banco), como em produção.

```bash
# No container (sobe o Postgres se preciso): lint, tipos e testes com cobertura
docker compose -f docker-compose.workers.yml run --rm test

# Fora do Docker, com um Postgres local
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ponto_test npm test
npm run test:cobertura
npm run lint        # Biome (lint e formatação); npm run lint:corrigir aplica as correções
npm run typecheck   # app e testes
```

O banco de teste é **apagado e recriado** a cada execução, com as migrações
de `db/migrations`. Por segurança, o nome dele precisa conter `test`.

| Pasta | Conteúdo |
|---|---|
| `test/unit/` | Funções puras: horário e fuso, horas trabalhadas, validação de valores, datas e horários, semanas do mês, formato da API |
| `test/integracao/` | API pelo Worker: cadastro, login, sessão e cookie, ponto, registros e paginação, dashboard e semanas, isolamento entre contas, CSRF |
| `test/helpers.ts` | Cliente HTTP com cookies, SQL direto no banco de teste, criação de contas e turnos |

No CI (job `app-workers`), a cobertura mínima é de 90% das linhas.

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

## Etapa 4 — Deploy (passo a passo)

Os comandos rodam na pasta do projeto, em qualquer terminal (os exemplos
funcionam no PowerShell). A ordem importa: a URL de produção só muda no
passo 5, e até lá o Render continua atendendo.

### 1. Preparar

```bash
npm ci
npx wrangler login      # abre o navegador para autorizar sua conta Cloudflare
npx wrangler whoami     # mostra o Account ID, usado no passo 5
```

### 2. Banco (Neon)

```bash
npm run migrar
```

Cole a connection string do Neon quando o script pedir. Ela aplica o índice
da Etapa 2; as tabelas e os dados não mudam.

### 3. Hyperdrive

No painel do Neon, em **Connect**, copie a connection string **sem** a opção
*Connection pooling* (o Hyperdrive já faz o pool) e apague o trecho a partir
do `?` (o Hyperdrive sempre usa TLS). Então:

```bash
npx wrangler hyperdrive create ponto-entregador --caching-disabled --connection-string="postgresql://USUARIO:SENHA@ep-xxxx.sa-east-1.aws.neon.tech/neondb"
```

O cache fica desligado porque o app lê logo depois de gravar (bater o ponto
e ver o turno aberto); com cache, a tela poderia mostrar dados de até 60 s
atrás. Copie o `id` que o comando mostra para `hyperdrive[0].id` no
`wrangler.jsonc` e faça commit dessa linha (o id não é segredo).

### 4. Validar sem mexer em produção

Publique uma cópia com outro nome:

```bash
npx wrangler deploy --name ponto-entregador-v2
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put SESSION_SECRET --name ponto-entregador-v2   # cole o valor gerado acima
npm run redefinir-senha
```

Abra `https://ponto-entregador-v2.load1.workers.dev`:

1. `/health` responde `{"status":"ok","banco":"ok"}`.
2. Entre com a senha nova. Os registros antigos aparecem na tabela e no
   dashboard.
3. Bata o ponto, encerre o turno, edite e apague o registro de teste.
4. **CPU do login:** no painel da Cloudflare, **Workers & Pages →
   ponto-entregador-v2 → Logs**, abra a requisição `POST /api/auth/login` e
   veja o tempo de CPU. O plano gratuito permite 10 ms por requisição e o
   bcrypt de custo 10 gasta cerca de 80 ms. A Cloudflare tolera estouros
   ocasionais (e o login é raro, a sessão dura 30 dias), mas, se o login
   devolver **erro 1102 "Worker exceeded resource limits"**, pare aqui. As
   saídas são reduzir `BCRYPT_COST` (menos seguro) ou o plano Workers Paid
   (US$ 5/mês).

### 5. Virar a URL

Defina o segredo do Worker de produção (pode ser um valor novo):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put SESSION_SECRET
```

No GitHub, em **Settings → Secrets and variables → Actions**, crie:

| Segredo | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Painel da Cloudflare → **My Profile → API Tokens → Create Token**, modelo **Edit Cloudflare Workers** |
| `CLOUDFLARE_ACCOUNT_ID` | O Account ID do `npx wrangler whoami` |

Faça o merge da PR na `main`. Depois do CI, o workflow **Deploy** publica o
Worker `ponto-entregador`, substituindo o proxy do Render na mesma URL, e
confere o `/health`. Sem esperar o CI, `npx wrangler deploy` faz o mesmo.

Confira `https://ponto-entregador.load1.workers.dev` e apague a cópia de
validação:

```bash
npx wrangler delete --name ponto-entregador-v2
```

### 6. Render

No painel do Render, suspenda o serviço (**Settings → Suspend Web Service**).
Ele fica parado de 1 a 2 semanas como plano de volta; depois disso, saem o
app Flask, o `Dockerfile`, o `render.yaml`, o `cloudflare-worker/` e os jobs
Python do CI.

### Plano de volta

1. No painel da Cloudflare, **Workers & Pages → ponto-entregador →
   Deployments**, escolha a última versão do proxy (anterior à virada) e use
   **Rollback**. A URL volta a apontar para o Render.
2. Retome o serviço no Render.
3. O Flask não confere senhas bcrypt. Para uma conta redefinida no passo 4
   entrar lá de novo, gere um hash do Werkzeug (`flask shell` →
   `generate_password_hash("nova-senha")`) e grave em `users.password_hash`.
