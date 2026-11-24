# 🛵 Ponto do Entregador

Aplicação web para entregadores registrarem **horas trabalhadas**, **ganhos** e **custos** diários, funcionando como um ponto eletrônico, com dashboard e tabela de registros.

Substitui o fluxo antigo (formulário no Tally → Google Sheets) por uma aplicação única, com login por usuário e cada pessoa vendo apenas os próprios dados.

No ar em **https://ponto-entregador.load1.workers.dev**.

---

## 📌 Funcionalidades

### Acesso
- Landing page pública com as funcionalidades e o caminho para o login.
- Cadastro e login por e-mail e senha (hash bcrypt). A sessão dura 30 dias.
- Cada usuário acessa apenas os seus registros.

### Painel (área logada)

#### 1. Ponto
- Data atual centralizada no topo, **não editável**.
- **"Registrar entrada"** salva a data e o horário atuais em um novo registro; o botão vira **"Registrar saída"**.
- Depois da saída, aparece o formulário de **ganhos** e **custos**, gravados na mesma linha. Ao enviar, o ciclo recomeça.
- Botão **(+)** para adicionar um registro de outra data.
- O estado vem do banco (registro sem saída = turno aberto), então sobrevive a recarregar a página ou trocar de aparelho.

#### 2. Dashboard
- Filtro de **mês**, aberto no mês atual, e de **semana real** (domingo a sábado, podendo incluir dias dos meses vizinhos, ex.: 27 de setembro a 3 de outubro).
- Cards: faturamento, custos, lucro, média por turno, **dia mais lucrativo** e **dia menos lucrativo**.
- Gráfico de ganhos por dia, com o lucro do dia ao tocar na barra.

#### 3. Registros
| Data | Dia da semana | Entrada | Saída | Ganhos | Custos | Horas trabalhadas |
|------|---------------|---------|-------|--------|--------|-------------------|

- **Dia da semana** e **horas trabalhadas** são calculados (não ficam no banco).
- 10 registros por página, mais recentes primeiro, com edição e exclusão.

### Requisitos transversais
- Layout **responsivo** (o uso principal é pelo celular).
- **Testes** automatizados, **CI/CD** e **logs** estruturados.

---

## 🧰 Stack

| Camada | Tecnologia |
|--------|------------|
| Runtime | Cloudflare Workers (plano gratuito, sem hibernação) |
| Backend | TypeScript + [Hono](https://hono.dev) |
| Frontend | HTML, CSS e JavaScript estáticos, Bootstrap 5, Chart.js |
| Banco de dados | PostgreSQL no Neon, acessado pelo Cloudflare Hyperdrive (driver `pg`) |
| Senhas / sessão | `bcryptjs` + cookie assinado (HMAC) |
| Migrações | Arquivos `.sql` em `db/migrations/` |
| Testes | Vitest no runtime do Workers (`@cloudflare/vitest-plugin`), contra Postgres de verdade |
| Qualidade | Biome (lint + format), TypeScript |
| Ambiente local | Docker Compose (Postgres + `wrangler dev`) |
| CI/CD | GitHub Actions |

---

## 🗂️ Estrutura do projeto

```
ponto-entregador/
├── .github/workflows/
│   ├── ci.yml                 # lint, tipos, testes e build em todo push/PR
│   └── deploy.yml             # publica na Cloudflare depois do CI verde na main
├── src/
│   ├── index.ts               # app Hono: logs, cabeçalhos de segurança, CSRF, rotas, erros
│   ├── db.ts                  # uma conexão por requisição, aberta só se a rota usar o banco
│   ├── sessao.ts              # cookie de sessão assinado
│   ├── routes/
│   │   ├── auth.ts            # cadastro, login, logout, /me
│   │   └── api.ts             # ponto, registros, dashboard
│   ├── services/              # regras de negócio (ponto, registros, dashboard)
│   └── lib/                   # horário e fuso, validação, erros, formato da API
├── public/                    # landing, login, cadastro, painel, CSS, JS e imagens
├── db/migrations/             # schema do banco (SQL)
├── test/
│   ├── unit/                  # funções puras: horas, validação, semanas do mês
│   ├── integracao/            # API pelo Worker: auth, ponto, registros, dashboard, segurança
│   └── helpers.ts
├── scripts/
│   ├── migrar.mjs             # npm run migrar
│   ├── redefinir-senha.mjs    # npm run redefinir-senha
│   └── bench-bcrypt.mjs       # npm run bench:bcrypt
├── docker/Dockerfile          # imagem de desenvolvimento (Node + certificados)
├── docker-compose.yml         # Postgres + app + testes, só para uso local
├── docs/migracao-workers.md   # histórico e decisões da migração do Flask/Render
├── wrangler.jsonc             # configuração do Worker
├── vitest.config.ts
└── package.json
```

---

## 🗃️ Modelo de dados

### `users`
| Campo | Tipo | Observação |
|-------|------|-----------|
| id | serial PK | |
| email | varchar(255) | único |
| password_hash | varchar(255) | bcrypt |
| name | varchar(100) | |
| created_at | timestamptz | |

### `work_records`
| Campo | Tipo | Observação |
|-------|------|-----------|
| id | serial PK | |
| user_id | FK → users.id | |
| date | date | data do início do turno |
| start_time | time | entrada |
| end_time | time, **nullable** | `NULL` = turno em aberto |
| earnings | numeric(10,2), **nullable** | preenchido após a saída |
| costs | numeric(10,2), **nullable** | preenchido após a saída |
| created_at / updated_at | timestamptz | |

**Regras**
- Apenas **um turno em aberto por usuário** (índice único parcial em `user_id WHERE end_time IS NULL`).
- `earnings` e `costs` ≥ 0.
- Se `end_time < start_time`, o turno passou da meia-noite.
- Pode haver mais de um turno no mesmo dia (ex.: almoço e jantar).
- O "agora" do sistema usa o fuso `America/Sao_Paulo`.

---

## 🔌 Rotas

### Páginas
| Rota | Descrição |
|------|-----------|
| `/` | Landing page |
| `/login`, `/cadastro` | Acesso (quem já está logado vai para `/app`) |
| `/app` | Painel: ponto, dashboard e registros (exige login) |
| `/health` | Confere o Worker e o banco |

### API
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Cadastro (já inicia a sessão) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Sair |
| GET | `/api/auth/me` | Usuário da sessão |
| GET | `/api/clock/status` | Estado: `idle`, `working` ou `awaiting_totals` |
| POST | `/api/clock/in` | Registra entrada |
| POST | `/api/clock/out` | Registra saída no turno aberto |
| POST | `/api/clock/close` | Envia ganhos e custos e conclui o ciclo |
| GET | `/api/records?page=N` | Registros, 10 por página: `{ items, page, per_page, total, total_pages }` |
| POST | `/api/records` | Cria registro manual (botão +) |
| PUT | `/api/records/:id` | Edita registro |
| DELETE | `/api/records/:id` | Remove registro |
| GET | `/api/dashboard/months` | Meses com registros |
| GET | `/api/dashboard?year=&month=&week=` | Métricas do mês ou de uma semana |

As rotas fora de `/api/auth` exigem sessão e respondem `401` em JSON sem ela.

**Estados do ponto**
```
idle ──(entrada)──▶ working ──(saída)──▶ awaiting_totals ──(ganhos/custos)──▶ idle
```

---

## 🚀 Rodando localmente

Requer Docker.

```bash
docker compose up --build
```

O `--build` só é necessário na primeira vez ou quando `docker/Dockerfile` mudar.

- App: http://localhost:8787. Crie uma conta em `/cadastro`.
- Saúde do app e do banco: http://localhost:8787/health
- Postgres: `localhost:5433`, usuário/senha `postgres`, banco `ponto`

O schema de `db/migrations` é aplicado na criação do volume. Para recriar o banco do zero: `docker compose down -v`.

Sem Docker (Node 22 ou mais novo + Postgres local na porta 5433):

```bash
npm install
cp .dev.vars.example .dev.vars   # e troque o SESSION_SECRET
npm run dev
```

---

## ✅ Testes

```bash
# No container (sobe o Postgres se preciso): lint, tipos e testes com cobertura
docker compose run --rm test

# Fora do Docker, com um Postgres local
npm test
npm run test:cobertura
npm run lint        # npm run lint:corrigir aplica as correções
npm run typecheck
```

Os testes rodam **dentro do runtime do Workers**, e cada requisição passa pelo Worker inteiro (middlewares, sessão, CSRF, banco), como em produção. O banco de teste (`ponto_test`) é apagado e recriado a cada execução; por segurança, o nome precisa conter `test`.

Cobertura mínima: 90% das linhas.

---

## 🔄 CI/CD (GitHub Actions)

**`ci.yml`** — em todo push ou pull request para `main` ou `develop`: Biome, checagem de tipos, testes com cobertura contra um Postgres de serviço e build do Worker (`wrangler deploy --dry-run`).

**`deploy.yml`** — quando o CI passa na `main` (ou à mão, em *Actions → Deploy → Run workflow*): `npx wrangler deploy` no código que o CI testou e conferência do `/health` em produção.

Segredos do repositório (*Settings → Secrets and variables → Actions*):
- `CLOUDFLARE_API_TOKEN` — token com o modelo *Edit Cloudflare Workers*.
- `CLOUDFLARE_ACCOUNT_ID` — aparece em `npx wrangler whoami`.

---

## ☁️ Produção

| Peça | Onde |
|------|------|
| Worker `ponto-entregador` | Cloudflare (plano gratuito) |
| Banco | Neon (Postgres) |
| Conexão Worker → banco | Hyperdrive `ponto-entregador`, com cache desligado (o app lê logo depois de gravar) |
| `SESSION_SECRET` | Segredo do Worker: `npx wrangler secret put SESSION_SECRET` |

### Tarefas de manutenção

Rodam em qualquer terminal (PowerShell, cmd, Linux, macOS) e pedem a connection string do Neon sem mostrá-la na tela:

```bash
npm run migrar           # aplica db/migrations no Neon (seguro rodar de novo)
npm run redefinir-senha  # define uma nova senha para uma conta
```

Uma migração nova vai em `db/migrations/NNNN_descricao.sql`, escrita para poder rodar de novo sem efeito (`IF NOT EXISTS`). Aplique no Neon com `npm run migrar` **antes** do merge que depende dela.

### Limite de CPU do plano gratuito

O plano gratuito permite 10 ms de CPU por requisição, e o bcrypt de custo 10 gasta cerca de 80 ms. Só cadastro e login calculam bcrypt, e a Cloudflare tolera estouros ocasionais. Se o login começar a responder **erro 1102**, as saídas são reduzir `BCRYPT_COST` no `wrangler.jsonc` (menos seguro) ou o plano Workers Paid.

---

## 📈 Logs

- Cada requisição gera uma linha JSON (`metodo`, `caminho`, `status`, `ms`, `user_id`), além de eventos de negócio (entrada, saída, registros, login falho) e erros.
- Ficam no painel da Cloudflare: **Workers & Pages → ponto-entregador → Logs**. Em tempo real: `npx wrangler tail ponto-entregador`.
- Nunca são logados: senhas, cookies ou dados sensíveis.

---

## 🔒 Segurança
- Senhas com bcrypt.
- Cookie de sessão assinado, `HttpOnly`, `Secure` e `SameSite=Lax`. Trocar a senha encerra as sessões abertas.
- Checagem de origem (CSRF) nas rotas `/api/*`.
- Cabeçalhos de segurança em todas as respostas.
- Validação de entrada no servidor e consultas parametrizadas.
- Toda consulta filtra pelo usuário da sessão; registro de outra conta responde 404.

---

## 🌿 Fluxo de Git

```bash
git switch main
git pull
git switch -c feature/nome-da-feature

# ... commits ...

git push -u origin feature/nome-da-feature
# abrir PR para a main: o CI roda; depois do merge, o deploy é automático
```

Crie a branch **antes** de editar: commits feitos direto na `main` local precisam ser movidos depois.

---

## 🗺️ Histórico e ideias

O app nasceu em Flask no Render e foi migrado para Cloudflare Workers para acabar com a espera de 30 a 60 s do Render acordando. O plano e as decisões estão em [`docs/migracao-workers.md`](docs/migracao-workers.md).

**Ideias futuras**
- PWA (instalar no celular)
- Importar o histórico do Google Sheets
- Metas diárias/mensais
- Exportar registros em CSV
- Separar ganhos por plataforma (iFood, Uber Eats etc.)
- Custos detalhados (combustível, manutenção)

---

## 📄 Licença
MIT. Veja [`LICENSE`](LICENSE).
