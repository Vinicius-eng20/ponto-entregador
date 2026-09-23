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

### Testando o fluxo da Fase 2 manualmente

Com o `docker compose up --build` no ar (veja acima), acesse `http://localhost:5000` e:

1. Clique em **"Cadastre-se"**, crie uma conta (nome, e-mail, senha) — o login é feito automaticamente após o cadastro.
2. Na home, clique em **"Registrar entrada"**. O botão muda para **"Registrar saída"**.
3. Clique em **"Registrar saída"**. Aparece o formulário de ganhos e custos.
4. Preencha e envie. A página recarrega, a linha aparece na tabela de **Registros** (com dia da semana e horas trabalhadas já calculados) e o botão volta a ser **"Registrar entrada"**.
5. Clique no botão **(+)** ao lado da data para adicionar um registro de outro dia (data, entrada, saída, ganhos e custos).
6. Use o botão **"Excluir"** na tabela para remover um registro.
7. Feche a aba e volte a abrir `http://localhost:5000`: o estado do ponto (aberto, aguardando totais ou ocioso) é recalculado a partir do banco, não se perde ao recarregar a página.

Se preferir testar pela API diretamente (por exemplo com `curl` ou Postman), os endpoints relevantes desta fase são:

- `GET /api/clock/status`
- `POST /api/clock/in`
- `POST /api/clock/out`
- `POST /api/clock/close` — corpo `{"earnings": 50.38, "costs": 19.59}`
- `GET /api/records`
- `POST /api/records` — corpo `{"date": "2026-09-15", "start_time": "10:54", "end_time": "11:58", "earnings": 23.72, "costs": 4.80}`
- `DELETE /api/records/<id>`

Todas exigem sessão autenticada (cookie de login) e, para métodos que alteram dados, o cabeçalho `X-CSRFToken` (o valor está disponível na tag `<meta name="csrf-token">` de qualquer página renderizada).

> **Nota sobre o escopo desta fase:** a edição de registros existentes na tabela e o dashboard (seção "Dashboard" da home) ficam para a Fase 3. Por enquanto a tabela permite apenas visualizar e excluir. Os testes automatizados (`pytest`) também serão adicionados junto com a Fase 3, cobrindo o que foi construído nas Fases 1 e 2.

### Importar histórico do Google Sheets
Exporte a planilha como CSV e execute:
```bash
docker compose exec web python scripts/import_sheets_csv.py caminho/arquivo.csv --email seu@email.com
```

---

## ✅ Testes

```bash
pip install -r requirements-dev.txt
pytest --cov=app --cov-report=term-missing
ruff check .
```

Estratégia:
- **Unitários**: cálculo de horas (inclusive virada de meia-noite), dia da semana, agregações do dashboard.
- **Integração**: autenticação, ciclo completo do ponto, CRUD de registros, validações.
- **Segurança/isolamento**: um usuário não acessa registros de outro.
- Os testes rodam contra PostgreSQL (mesmo banco de produção) no CI, para evitar diferenças de comportamento.

Meta de cobertura: **≥ 80%**.

---

## 🔄 CI/CD (GitHub Actions)

**`ci.yml`** — em todo push e pull request:
1. Sobe um service container PostgreSQL.
2. Instala dependências.
3. Roda `ruff check` e `ruff format --check`.
4. Roda `pytest` com cobertura.
5. Faz o build da imagem Docker (garante que o Dockerfile não quebrou).

**`deploy.yml`** — ao entrar na `main` com o CI verde:
1. Dispara o deploy no Render (via Deploy Hook armazenado nos *Secrets*).
2. O container executa `scripts/entrypoint.sh`, que aplica as migrations e inicia o Gunicorn.
3. O Render usa `/health` para validar que a nova versão subiu.

**Fluxo de branches**
- `main`: produção (protegida; merge somente via PR com CI verde).
- `feature/*`, `fix/*`: desenvolvimento.

**Secrets no GitHub / Render**
- `RENDER_DEPLOY_HOOK_URL`
- `DATABASE_URL` (Neon), `SECRET_KEY` (configurados no Render)

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
- [ ] Repositório, estrutura, Docker Compose, Postgres
- [ ] Modelos e migrações
- [ ] Autenticação

**Fase 2 — Funcionalidade principal**
- [ ] API e tela do ponto (entrada → saída → ganhos/custos)
- [ ] Modal (+) de registro manual
- [ ] Tabela de registros com edição e exclusão

**Fase 3 — Dashboard**
- [ ] Endpoint de métricas
- [ ] Filtro de mês e gráficos

**Fase 4 — Qualidade e entrega**
- [ ] Testes unitários e de integração
- [ ] Logs estruturados
- [ ] CI/CD e deploy no Render + Neon
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
