import type { ExecutionContext } from "hono";
import { Client } from "pg";

import type { Env } from "./types";

/**
 * Abre uma conexão com o Postgres para a requisição atual e fecha ao final.
 *
 * Em produção a conexão passa pelo Hyperdrive, que mantém um pool de conexões
 * já abertas com o Neon perto do Worker. Abrir um Client por requisição é o
 * padrão recomendado pela Cloudflare: o custo real de conexão fica no pool.
 */
export async function withDb<T>(
  env: Env,
  ctx: ExecutionContext,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    // Fecha a conexão sem atrasar a resposta.
    ctx.waitUntil(client.end());
  }
}
