import type { MiddlewareHandler } from "hono";
import pg from "pg";

import type { AppEnv } from "./types";

// Sem conversões automáticas do driver: DATE e TIME viram Date do JavaScript
// (com fuso), o que desloca datas. Mantemos tudo como texto e convertemos
// NUMERIC (ganhos/custos) para número.
pg.types.setTypeParser(1082, (valor: string) => valor); // DATE  -> "AAAA-MM-DD"
pg.types.setTypeParser(1083, (valor: string) => valor); // TIME  -> "HH:MM:SS"
pg.types.setTypeParser(1700, (valor: string) => Number(valor)); // NUMERIC -> number

/**
 * Disponibiliza `c.get("db")()`: abre a conexão só se a rota precisar e a
 * fecha depois da resposta, sem atrasá-la.
 *
 * Em produção a conexão passa pelo Hyperdrive, que mantém um pool de conexões
 * já abertas com o Neon perto do Worker. Um Client por requisição é o padrão
 * recomendado pela Cloudflare: o custo real de conexão fica no pool.
 */
export const conexaoPorRequisicao: MiddlewareHandler<AppEnv> = async (c, next) => {
  let cliente: pg.Client | null = null;
  let conectando: Promise<pg.Client> | null = null;

  c.set("db", () => {
    if (!conectando) {
      cliente = new pg.Client({ connectionString: c.env.HYPERDRIVE.connectionString });
      const atual = cliente;
      conectando = atual.connect().then(() => atual);
    }
    return conectando;
  });

  try {
    await next();
  } finally {
    if (cliente) {
      const aberto: pg.Client = cliente;
      c.executionCtx.waitUntil(aberto.end().catch(() => undefined));
    }
  }
};
