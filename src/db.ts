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
  let encerrando = false;

  c.set("db", () => {
    if (!conectando) {
      const atual = new pg.Client({ connectionString: c.env.HYPERDRIVE.connectionString });
      // Ao fechar, o driver do Workers (pg-cloudflare) ainda está lendo o
      // socket e emite "This socket has been closed". Sem um ouvinte, esse
      // evento vira um erro não tratado. Ignoramos só o que acontece durante
      // o encerramento que nós pedimos; o resto vai para o log.
      atual.on("error", (erro) => {
        if (!encerrando) {
          console.error(JSON.stringify({ evento: "erro_conexao_banco", erro: String(erro) }));
        }
      });
      cliente = atual;
      conectando = atual.connect().then(() => atual);
    }
    return conectando;
  });

  try {
    await next();
  } finally {
    if (cliente) {
      const aberto: pg.Client = cliente;
      encerrando = true;
      c.executionCtx.waitUntil(aberto.end().catch(() => undefined));
    }
  }
};
