-- 0001: schema inicial.
--
-- Equivale à migração do Alembic "criação inicial: users e work_records"
-- (migrations/versions/28abd5d14336_*.py), que já está aplicada no Neon.
-- Em produção este arquivo NÃO precisa rodar: as tabelas já existem com os
-- mesmos nomes, tipos, constraints e índices. Ele serve para criar bancos
-- novos (container local, CI e testes) idênticos ao de produção.

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);

CREATE TABLE IF NOT EXISTS work_records (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    date        DATE NOT NULL,
    start_time  TIME NOT NULL,
    end_time    TIME,
    earnings    NUMERIC(10, 2),
    costs       NUMERIC(10, 2),
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ,
    CONSTRAINT ck_costs_non_negative CHECK (costs IS NULL OR costs >= 0),
    CONSTRAINT ck_earnings_non_negative CHECK (earnings IS NULL OR earnings >= 0)
);

CREATE INDEX IF NOT EXISTS ix_work_records_date ON work_records (date);
CREATE INDEX IF NOT EXISTS ix_work_records_user_id ON work_records (user_id);

-- No máximo um turno em aberto (sem saída) por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS ux_open_shift_per_user
    ON work_records (user_id)
    WHERE end_time IS NULL;
