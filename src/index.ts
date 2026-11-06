import bcrypt from "bcryptjs";
import { Hono } from "hono";

import { withDb } from "./db";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

/**
 * Health check com consulta real ao banco: confirma que o Worker, o Hyperdrive
 * e o Postgres estão conversando.
 */
app.get("/health", async (c) => {
  try {
    const agora = await withDb(c.env, c.executionCtx, async (db) => {
      const { rows } = await db.query<{ agora: string }>("SELECT now()::text AS agora");
      return rows[0].agora;
    });
    return c.json({ status: "ok", banco: "ok", agora });
  } catch (erro) {
    console.error(JSON.stringify({ evento: "health_falhou", erro: String(erro) }));
    return c.json({ status: "erro", banco: "indisponivel" }, 503);
  }
});

// ---------------------------------------------------------------------------
// Rotas temporárias da Fase 0 (prova de conceito). Saem na Etapa 1.
// ---------------------------------------------------------------------------

/** Lê o schema atual (o mesmo do Flask) para provar compatibilidade. */
app.get("/poc/banco", async (c) => {
  const dados = await withDb(c.env, c.executionCtx, async (db) => {
    const usuarios = await db.query<{ total: string }>("SELECT count(*)::text AS total FROM users");
    const registros = await db.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM work_records",
    );
    return {
      usuarios: Number(usuarios.rows[0].total),
      registros: Number(registros.rows[0].total),
    };
  });
  return c.json(dados);
});

/**
 * Gera e confere um hash bcrypt dentro do runtime do Workers.
 * O tempo de CPU real aparece no Workers Logs (campo cpuTime) após o deploy;
 * dentro do Worker o relógio não avança durante processamento puro de CPU.
 */
app.post("/poc/bcrypt", async (c) => {
  type Corpo = { senha?: string; custo?: number };
  const corpo: Corpo = await c.req.json<Corpo>().catch(() => ({}));
  const senha = corpo.senha ?? "senha-de-teste";
  const custo = Math.min(Math.max(Number(corpo.custo ?? 10), 4), 12);

  const hash = await bcrypt.hash(senha, custo);
  const confere = await bcrypt.compare(senha, hash);
  const naoConfere = await bcrypt.compare(`${senha}-errada`, hash);

  return c.json({ custo, prefixo: hash.slice(0, 7), confere, naoConfere });
});

export default app;
