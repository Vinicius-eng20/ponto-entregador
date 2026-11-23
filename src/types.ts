import type { Fetcher, Hyperdrive } from "@cloudflare/workers-types";
import type { Client } from "pg";

/** Bindings e variáveis configurados no wrangler.jsonc / segredos. */
export interface Env {
  HYPERDRIVE: Hyperdrive;
  ASSETS: Fetcher;
  /** Fuso usado para "agora" (data e hora do ponto). */
  TZ_APP: string;
  /** Custo do bcrypt (log2 das rodadas). Padrão 10. */
  BCRYPT_COST?: string;
  /** Chave para assinar o cookie de sessão. Segredo: .dev.vars / wrangler secret. */
  SESSION_SECRET?: string;
}

export interface UsuarioSessao {
  id: number;
  name: string;
  email: string;
}

/** Valores por requisição, disponíveis via c.get(...). */
export interface Variables {
  /** Abre (na primeira chamada) e devolve a conexão da requisição. */
  db: () => Promise<Client>;
  usuario: UsuarioSessao | null;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
