-- 0002: índice para a listagem paginada de registros.
--
-- A tabela é sempre lida por usuário, da data mais recente para a mais
-- antiga (GET /api/records?page=N). O índice entrega as linhas já nessa
-- ordem, sem ordenar a tabela inteira a cada página.
--
-- Em produção (Neon), aplique uma vez antes do deploy da Etapa 2:
--   psql "$DATABASE_URL" -f db/migrations/0002_indice_registros_por_data.sql

CREATE INDEX IF NOT EXISTS ix_work_records_user_date
    ON work_records (user_id, date DESC, start_time DESC, id DESC);
