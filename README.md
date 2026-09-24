# 🛵 Ponto do Entregador

Aplicação web para entregadores registrarem **horas trabalhadas**, **ganhos** e **custos** diários, funcionando como um ponto eletrônico, com tabela de registros e dashboard interativo.

Este projeto substitui o fluxo atual (formulário no Tally → Google Sheets → dashboard simples) por uma aplicação única, com login por usuário e cada pessoa vendo apenas os próprios dados.

---

## 📌 Funcionalidades

### Autenticação
- Cadastro e login por e-mail e senha (senha armazenada com hash).
- Cada usuário acessa apenas os seus registros.

### Home (três seções)

#### 1. Ponto (landing page)
- Data atual centralizada no topo, **não editável**.
- Botão **"Registrar entrada"**: salva a data e o horário atuais em um novo registro.
- Após a entrada, o botão muda para **"Registrar saída"**: salva o horário de saída na mesma linha.
- Após a saída, aparece um formulário de **ganhos** e **custos** do dia. No envio, os valores são gravados na mesma linha, o formulário some e o botão **"Registrar entrada"** volta, reiniciando o ciclo.
- Botão **(+)** para adicionar um registro manual de outra data (formulário equivalente ao do Tally: data, entrada, saída, ganhos e custos).
- O estado do ciclo vem do banco (registro sem saída = turno aberto), então sobrevive a recarregar a página ou trocar de dispositivo.

#### 2. Registros (tabela)
| Data | Dia da semana | Entrada | Saída | Ganhos | Custos | Horas trabalhadas |
|------|---------------|---------|-------|--------|--------|-------------------|

- **Dia da semana** e **horas trabalhadas** são calculados pelo sistema (não são gravados no banco).
- Ordenação, filtro por período, edição e exclusão de registros.

#### 3. Dashboard
- Filtro de **mês** (e ano).
- Cards: faturamento, custos, lucro líquido, média de horas por dia, ganho médio por hora, dias trabalhados.
- Gráficos: ganhos diários, evolução acumulada, ganhos vs. custos, ganho por hora por dia, média por dia da semana.

### Requisitos transversais
- Layout **responsivo** (mobile first, pois o uso principal é pelo celular).
- **Testes** automatizados, **CI/CD** e **logs**.

---

## 🧰 Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML, CSS, JavaScript e Bootstrap 5 (templates Jinja2 + `fetch` para a API) |
| Gráficos | Chart.js |
| Backend | Python 3.12 + Flask |
| ORM / Migrações | SQLAlchemy + Flask-Migrate (Alembic) |
| Autenticação | Flask-Login + Werkzeug (hash de senha) + Flask-WTF (CSRF) |
| Banco de dados | PostgreSQL (Neon, plano gratuito, em produção; container Postgres local) |
| Servidor WSGI | Gunicorn |
| Container | Docker + Docker Compose |
| Testes | pytest, pytest-cov |
| Qualidade | Ruff (lint + format) |
| CI/CD | GitHub Actions |
| Deploy | Render (web service gratuito) |
| Versionamento | Git + GitHub |

> **Por que Neon e não o Postgres do Render?** O Postgres gratuito do Render expira após um período; o Neon mantém o plano gratuito sem expirar. O web service gratuito do Render "hiberna" após inatividade, então o primeiro acesso depois de um tempo parado pode demorar alguns segundos.

---

## 🗂️ Estrutura do projeto

```
ponto-entregador/
├── .github/
│   └── workflows/
│       ├── ci.yml                # lint + testes em todo push/PR
│       └── deploy.yml            # deploy automático na main após CI verde
│
├── app/
│   ├── __init__.py               # application factory (create_app)
│   ├── config.py                 # Config, DevConfig, TestConfig, ProdConfig
│   ├── extensions.py             # db, migrate, login_manager, csrf
│   ├── logging_config.py         # configuração de logs (JSON em produção)
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py               # User
│   │   └── work_record.py        # WorkRecord (+ propriedades calculadas)
│   │
│   ├── routes/                   # blueprints (camada HTTP, fina)
│   │   ├── __init__.py
│   │   ├── auth.py               # /login, /register, /logout
│   │   ├── pages.py              # páginas HTML: /, /registros, /dashboard
│   │   ├── clock.py              # API do ponto: /api/clock/*
│   │   ├── records.py            # API CRUD: /api/records
│   │   └── dashboard.py          # API de métricas: /api/dashboard
│   │
│   ├── services/                 # regras de negócio (testáveis sem HTTP)
│   │   ├── clock_service.py      # entrada, saída, fechar turno com ganhos/custos
│   │   ├── record_service.py     # criação/edição/validação de registros
│   │   └── dashboard_service.py  # agregações e métricas do mês
│   │
│   ├── schemas/                  # validação de entrada/saída (ex.: Marshmallow ou Pydantic)
│   │   └── record_schema.py
│   │
│   ├── utils/
│   │   ├── time_utils.py         # horas trabalhadas, fuso America/Sao_Paulo, dia da semana
│   │   └── errors.py             # handlers de erro (400, 401, 404, 500)
│   │
│   ├── templates/
│   │   ├── base.html             # layout, navbar, bootstrap
│   │   ├── auth/
│   │   │   ├── login.html
│   │   │   └── register.html
│   │   ├── home.html             # seções: ponto, registros, dashboard
│   │   ├── partials/
│   │   │   ├── clock.html        # botão entrada/saída + form de ganhos/custos
│   │   │   ├── add_record_modal.html   # modal do botão (+)
│   │   │   ├── records_table.html
│   │   │   └── dashboard.html
│   │   └── errors/
│   │       ├── 404.html
│   │       └── 500.html
│   │
│   └── static/
│       ├── css/
│       │   └── style.css
│       └── js/
│           ├── api.js            # wrapper do fetch (CSRF, tratamento de erro)
│           ├── clock.js          # lógica do ponto eletrônico
│           ├── records.js        # tabela, edição, exclusão, modal (+)
│           └── dashboard.js      # filtros e gráficos (Chart.js)
│
├── migrations/                   # gerado pelo Flask-Migrate
│
├── tests/
│   ├── conftest.py               # app de teste, banco isolado, fixtures (usuário, client logado)
│   ├── unit/
│   │   ├── test_time_utils.py    # horas trabalhadas, virada de meia-noite, dia da semana
│   │   ├── test_clock_service.py
│   │   └── test_dashboard_service.py
│   └── integration/
│       ├── test_auth.py
│       ├── test_clock_api.py     # ciclo completo: entrada → saída → form → nova entrada
│       ├── test_records_api.py
│       └── test_isolation.py     # usuário A não enxerga dados do usuário B
│
├── scripts/
│   ├── entrypoint.sh             # aplica migrations e sobe o gunicorn
│   └── import_sheets_csv.py      # importa o histórico do Google Sheets (CSV)
│
├── docker/
│   └── Dockerfile
├── docker-compose.yml            # app + postgres para desenvolvimento
├── docker-compose.test.yml       # (opcional) app + postgres para rodar testes
│
├── wsgi.py                       # ponto de entrada do gunicorn
├── requirements.txt
├── requirements-dev.txt          # pytest, pytest-cov, ruff
├── pyproject.toml                # config do ruff e pytest
├── .env.example
├── .gitignore
├── .dockerignore
└── README.md
```

### Decisões de arquitetura
- **Application factory** (`create_app`) para facilitar testes e múltiplos ambientes.
- **Blueprints → Services → Models**: rotas só tratam HTTP; regra de negócio fica em `services/`, o que permite testar sem subir servidor.
- **Backend renderiza as páginas e expõe uma API JSON** consumida por `fetch`. Assim o frontend continua sendo HTML/CSS/JS puro com Bootstrap, sem framework SPA.
- **Isolamento por usuário**: todas as queries filtram por `user_id` (coberto por teste dedicado).

---

## 🗃️ Modelo de dados

### `users`
| Campo | Tipo | Observação |
|-------|------|-----------|
| id | serial PK | |
| email | varchar(255) | único |
| password_hash | varchar(255) | |
| name | varchar(100) | |
| created_at | timestamptz | |

### `work_records`
| Campo | Tipo | Observação |
|-------|------|-----------|
| id | serial PK | |
| user_id | FK → users.id | indexado |
| date | date | data do início do turno |
| start_time | time | horário de entrada |
| end_time | time, **nullable** | `NULL` = turno em aberto |
| earnings | numeric(10,2), **nullable** | preenchido após a saída |
| costs | numeric(10,2), **nullable** | preenchido após a saída |
| created_at / updated_at | timestamptz | |

**Regras**
- Índice em `(user_id, date)`.
- Apenas **um turno em aberto por usuário** (índice único parcial em `user_id WHERE end_time IS NULL`).
- `earnings` e `costs` ≥ 0.
- **Dia da semana** e **horas trabalhadas** não são armazenados: são calculados. Se `end_time < start_time`, considera-se que o turno virou a meia-noite.
- Não há unicidade por data, permitindo mais de um turno no mesmo dia (ex.: almoço e jantar).
- O "agora" do sistema usa o fuso `America/Sao_Paulo`.

---

## 🔌 Endpoints

### Páginas
| Rota | Descrição |
|------|-----------|
| `GET /login`, `POST /login` | Login |
| `GET /register`, `POST /register` | Cadastro |
| `POST /logout` | Sair |
| `GET /` | Home (ponto, registros e dashboard) |

### API (requer login)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/clock/status` | Estado atual: `idle`, `working` ou `awaiting_totals` |
| POST | `/api/clock/in` | Registra entrada (data e hora atuais) |
| POST | `/api/clock/out` | Registra saída no turno aberto |
| POST | `/api/clock/close` | Envia ganhos e custos e conclui o ciclo |
| GET | `/api/records?from=&to=` | Lista registros (com dia da semana e horas calculados) |
| POST | `/api/records` | Cria registro manual (botão +) |
| PUT | `/api/records/<id>` | Edita registro |
| DELETE | `/api/records/<id>` | Remove registro |
| GET | `/api/dashboard?year=&month=` | Métricas e séries do período |
| GET | `/health` | Health check (usado pelo deploy) |

**Estados do ponto**
```
idle ──(entrada)──▶ working ──(saída)──▶ awaiting_totals ──(ganhos/custos)──▶ idle
```
- `working`: existe registro com `end_time IS NULL`.
- `awaiting_totals`: existe registro com `end_time` preenchido e `earnings IS NULL`.
- Assim o formulário de ganhos/custos reaparece mesmo se o usuário fechar a página antes de enviar.

---

## 🚀 Rodando localmente

### Pré-requisitos
- Docker e Docker Compose
- Git

### Passo a passo
```bash
git clone https://github.com/<seu-usuario>/ponto-entregador.git
cd ponto-entregador

cp .env.example .env        # ajuste SECRET_KEY e credenciais
docker compose up --build
```

A aplicação ficará em `http://localhost:5000`.

### Variáveis de ambiente (`.env.example`)
```env
FLASK_ENV=development
SECRET_KEY=troque-esta-chave
DATABASE_URL=postgresql://postgres:postgres@db:5432/ponto
TZ=America/Sao_Paulo
LOG_LEVEL=INFO
```

### Migrações
```bash
docker compose exec web flask db migrate -m "mensagem"
docker compose exec web flask db upgrade
```

### Testando a Fase 2 (autenticação, ponto e registros)

Com o `docker compose up --build` no ar, acesse `http://localhost:5000`:

1. **Criar conta**: acesse `/register`, preencha nome, e-mail e senha. Você já entra logado após o cadastro.
2. **Ciclo do ponto**: na tela inicial, clique em **"Registrar entrada"**. O botão muda para **"Registrar saída"**; clique nele para encerrar o turno. Em seguida aparece o formulário de **ganhos e custos** — preencha e envie. O ciclo volta ao início e a nova linha aparece na tabela de **Registros**, logo abaixo.
3. **Adicionar registro de outra data**: clique no botão **(+)** ao lado da data no topo. Preencha data, entrada, saída, ganhos e custos manualmente.
4. **Editar ou excluir**: na tabela de registros, use os botões **Editar** (abre o mesmo modal do +, já preenchido) ou **Excluir**.
5. **Isolamento entre usuários**: crie uma segunda conta em uma aba anônima — cada usuário só vê e só consegue editar/excluir os próprios registros.
6. **Sessão**: ao fazer logout, tentar acessar a home ou chamar a API redireciona para `/login` (páginas) ou retorna `401` em JSON (chamadas `fetch`).

Nesta fase o **dashboard** ainda é um placeholder ("chega na próxima fase") — a seção existe na home, mas sem gráficos.

> Não é necessário rodar `flask db migrate` nesta fase: nenhum modelo novo foi adicionado, apenas rotas, serviços e telas em cima do schema já criado na Fase 1.

Se preferir testar pela API diretamente (`curl`, Postman etc.), os endpoints desta fase são `GET/POST /api/clock/status|in|out|close`, `GET/POST /api/records`, `PUT/DELETE /api/records/<id>`. Todos exigem sessão autenticada (cookie de login) e, para métodos que alteram dados, o cabeçalho `X-CSRFToken` (o valor está na tag `<meta name="csrf-token">` de qualquer página renderizada).

#### Rodando sem Docker (opcional, para debugar mais rápido)

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

export FLASK_APP=wsgi.py
export FLASK_ENV=development
export SECRET_KEY=dev
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ponto  # aponte para um Postgres local

flask db upgrade
flask run
```

### Testando a Fase 3 (dashboard)

Na home, vá até a seção **Dashboard**:

1. Escolha um **mês** no primeiro filtro. Os meses listados são os que já têm pelo menos um registro concluído, mais o mês atual.
2. O filtro de **semana** só é habilitado depois de escolher um mês. As opções são geradas dinamicamente (Semana 1: dias 01–07, Semana 2: 08–14, e assim por diante até o fim do mês).
3. Escolher **"Mês inteiro"** (opção padrão da semana) filtra o mês todo; escolher uma semana específica restringe o período a ela — nunca os dois ao mesmo tempo.
4. Os cards mostram: **faturamento**, **custos**, **média de horas trabalhadas** e **percentual de custos sobre os ganhos** do período filtrado.
5. O gráfico de barras mostra os **ganhos por dia** dentro do período selecionado.

> Turnos ainda em aberto (sem ganhos/custos preenchidos) não entram nas contas do dashboard, pelo mesmo motivo que aparecem com "—" na tabela de registros.

### Importar histórico do Google Sheets
Exporte a planilha como CSV e execute:
```bash
docker compose exec web python scripts/import_sheets_csv.py caminho/arquivo.csv --email seu@email.com
```

---

## ✅ Testes

```bash
pip install -r requirements.txt -r requirements-dev.txt

# opção 1: contra um Postgres já rodando (ex.: docker compose up -d db)
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ponto_test
export SECRET_KEY=test

pytest --cov=app --cov-report=term-missing
ruff check .

# opção 2: tudo isolado em containers (sobe um Postgres só para os testes)
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

Estratégia:
- **Unitários**: cálculo de horas (inclusive virada de meia-noite), dia da semana, agregações do dashboard.
- **Integração**: autenticação, ciclo completo do ponto, CRUD de registros, validações.
- **Segurança/isolamento**: um usuário não acessa registros de outro.
- Os testes rodam contra PostgreSQL (mesmo banco de produção) no CI, para evitar diferenças de comportamento.

Meta de cobertura: **≥ 80%**.

---

## 🔄 CI/CD (GitHub Actions)

**`.github/workflows/ci.yml`** — em todo push ou pull request para `main` ou `develop`:
1. Sobe um service container PostgreSQL (`ponto_test`).
2. Instala as dependências (`requirements.txt` + `requirements-dev.txt`).
3. Roda `ruff check` e `ruff format --check`.
4. Roda `pytest` com cobertura, falhando o build se ficar **abaixo de 80%** (`--cov-fail-under=80`).
5. Faz o build da imagem Docker, para garantir que o `Dockerfile` não quebrou.

**`.github/workflows/deploy.yml`** — disparado automaticamente quando o workflow **CI** termina com sucesso na branch `main` (usando `workflow_run`, não em toda tag verde de qualquer branch):
1. Chama o *Deploy Hook* do Render (URL guardada em `secrets.RENDER_DEPLOY_HOOK_URL`).
2. O Render puxa a imagem, sobe o container, que roda `scripts/entrypoint.sh` (aplica as migrations e inicia o Gunicorn).
3. O Render usa `GET /health` para considerar o deploy saudável antes de trocar o tráfego.

> Como o deploy só dispara a partir da `main`, **nada é publicado automaticamente a partir da `develop` ou de branches de feature** — elas só rodam o CI (lint + testes).

**Segredo necessário no GitHub**
- `RENDER_DEPLOY_HOOK_URL` — em *Settings → Secrets and variables → Actions* do repositório.

---

## 🚢 Deploy no Render + Neon

A ideia: o **Neon** hospeda o Postgres (plano gratuito, não expira) e o **Render** hospeda a aplicação Flask a partir da imagem Docker do projeto (plano gratuito, mas "hiberna" após um tempo sem acessos — o primeiro request depois disso demora alguns segundos para acordar).

### 1. Criar o banco no Neon
1. Crie uma conta em [neon.tech](https://neon.tech) e um novo projeto (ex.: `ponto-entregador`).
2. Na página do projeto, copie a **Connection string** (formato `postgresql://usuario:senha@host/banco?sslmode=require`). Essa é a variável `DATABASE_URL` de produção.
3. O Neon já cria o banco pronto para uso — não precisa criar tabelas manualmente, as migrations (`flask db upgrade`) cuidam disso no primeiro deploy.

### 2. Criar o serviço no Render

**Opção A — usando o `render.yaml` deste projeto (recomendado):**
1. No painel do Render, escolha **New → Blueprint** e aponte para o repositório no GitHub.
2. O Render lê o `render.yaml` da raiz do projeto e já propõe o serviço configurado (Docker, `healthCheckPath: /health`, etc.).
3. Nas variáveis marcadas como "a preencher" (`SECRET_KEY` e `DATABASE_URL`), cole os valores gerados/copiados nos passos anteriores.

**Opção B — configurando manualmente:**
1. **New → Web Service**, conecte o repositório no GitHub.
2. **Runtime**: Docker. **Dockerfile Path**: `docker/Dockerfile`. **Docker Build Context**: `.` (raiz do projeto).
3. **Branch**: `main` (é a partir dela que o deploy automático via GitHub Actions vai disparar).
4. **Plan**: Free.
5. **Health Check Path**: `/health`.
6. Em **Environment**, adicione as variáveis:

   | Variável | Valor |
   |---|---|
   | `FLASK_ENV` | `production` |
   | `SECRET_KEY` | secret key |
   | `DATABASE_URL` | a connection string do Neon |
   | `TZ` | `America/Sao_Paulo` |
   | `LOG_LEVEL` | `INFO` |

7. Clique em **Create Web Service**. O primeiro deploy roda automaticamente e pode demorar alguns minutos (build da imagem + migrations).

### 3. Habilitar o deploy automático via GitHub Actions
1. No serviço já criado, vá em **Settings → Deploy Hook** e copie a URL.
2. No GitHub, vá em **Settings → Secrets and variables → Actions** do repositório e crie o secret `RENDER_DEPLOY_HOOK_URL` com essa URL.
3. Pronto: a partir de agora, todo merge na `main` que passar no CI dispara automaticamente um novo deploy (veja `.github/workflows/deploy.yml`).

> Se você usou a Opção A (Blueprint), o Render já cuida do deploy contínuo nativamente ao detectar pushes na `main` — o `deploy.yml` neste caso é redundante, mas inofensivo (só teria efeito prático se você desligar o "Auto-Deploy" nativo do Render e preferir controlar isso só pelo GitHub Actions).

### 4. Testar em produção
Acesse a URL que o Render fornece (algo como `https://ponto-entregador.onrender.com`), crie uma conta e repita o roteiro de testes manuais descrito nas seções de Fase 2 e Fase 3 deste README.

---

## 🌿 Fluxo de Git (branches)

Como até agora tudo foi commitado direto na `main`, a partir daqui o fluxo recomendado é:

```bash
# 1. Criar a branch de desenvolvimento a partir da main atualizada
git checkout main
git pull
git checkout -b develop
git push -u origin develop
```

No GitHub, em **Settings → Branches**, vale configurar:
- `main` como **branch protegida**: exigir Pull Request antes do merge, exigir que o check do CI passe.
- `develop` como a branch padrão de trabalho: novas features nascem a partir dela (`git checkout -b feature/nome-da-feature develop`) e voltam para ela via PR.

Fluxo do dia a dia:
```bash
git checkout develop
git pull
git checkout -b feature/exportar-csv

# ... commits ...

git push -u origin feature/exportar-csv
# abrir PR: feature/exportar-csv -> develop (CI roda automaticamente)
```

Quando `develop` estiver estável e pronta para ir ao ar, abre-se um PR `develop -> main`. Ao ser mesclado, o CI roda de novo na `main` e, se passar, o `deploy.yml` dispara o deploy no Render automaticamente — nenhum push direto na `main` deveria mais ser necessário.

---

## 📈 Logs

- Biblioteca padrão `logging`, configurada em `app/logging_config.py`.
- **Desenvolvimento**: formato legível no console.
- **Produção**: JSON em `stdout`, que o Render coleta e exibe no painel.
- Registrados: requisições (método, rota, status, tempo, `user_id`), eventos de negócio (entrada, saída, criação/edição/exclusão de registros), tentativas de login falhas e erros com *stack trace*.
- Nunca são logados: senhas, tokens ou dados sensíveis.
- Nível controlado por `LOG_LEVEL`.

---

## 🔒 Segurança
- Senhas com hash (Werkzeug).
- Proteção CSRF em formulários e chamadas `fetch`.
- Cookies de sessão `HttpOnly`, `Secure` e `SameSite=Lax` em produção.
- Validação de entrada no servidor (nunca só no frontend).
- Consultas via ORM (proteção contra SQL injection).
- Limite de tentativas de login (Flask-Limiter, opcional).

---

## 🗺️ Roadmap

**Fase 1 — Base**
- [x] Repositório, estrutura, Docker Compose, Postgres
- [x] Modelos e migrações
- [x] Autenticação

**Fase 2 — Funcionalidade principal**
- [x] API e tela do ponto (entrada → saída → ganhos/custos)
- [x] Modal (+) de registro manual
- [x] Tabela de registros com edição e exclusão

**Fase 3 — Dashboard**
- [x] Endpoint de métricas
- [x] Filtro de mês e semana, cards e gráfico de ganhos diários

**Fase 4 — Qualidade e entrega**
- [x] Testes unitários e de integração (47 testes, ~94% de cobertura)
- [x] Logs estruturados
- [x] CI/CD (GitHub Actions) e deploy no Render + Neon
- [ ] Importação do histórico do Google Sheets

**Ideias futuras**
- PWA (instalar no celular)
- Metas diárias/mensais
- Exportar registros em CSV
- Separar ganhos por plataforma (iFood, Uber Eats, etc.)
- Custos detalhados (combustível, manutenção)

---

## 📄 Licença
MIT License

Copyright (c) 2026 Vinicius Silva

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
