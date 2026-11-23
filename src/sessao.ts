import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Client } from "pg";

import { AppError } from "./lib/errors";
import type { AppEnv, UsuarioSessao } from "./types";

const COOKIE = "sessao";
const DURACAO_SEGUNDOS = 30 * 24 * 60 * 60;

function segredo(c: Context<AppEnv>): string {
  const valor = c.env.SESSION_SECRET;
  if (!valor || valor.length < 32) {
    throw new Error(
      "SESSION_SECRET ausente ou curto (mínimo 32 caracteres). " +
        "Local: crie o .dev.vars (veja .dev.vars.example). Produção: wrangler secret put SESSION_SECRET.",
    );
  }
  return valor;
}

/**
 * Impressão curta do hash da senha. Vai no cookie para que, ao trocar a
 * senha, as sessões abertas com a senha antiga deixem de valer.
 */
async function impressaoDaSenha(hash: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hash));
  return [...new Uint8Array(bytes).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cookieSeguro(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export async function iniciarSessao(
  c: Context<AppEnv>,
  usuario: { id: number; password_hash: string },
): Promise<void> {
  const expiraEm = Math.floor(Date.now() / 1000) + DURACAO_SEGUNDOS;
  const valor = `${usuario.id}.${expiraEm}.${await impressaoDaSenha(usuario.password_hash)}`;

  await setSignedCookie(c, COOKIE, valor, segredo(c), {
    path: "/",
    httpOnly: true,
    secure: cookieSeguro(c),
    sameSite: "Lax",
    maxAge: DURACAO_SEGUNDOS,
  });
}

export function encerrarSessao(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, { path: "/", secure: cookieSeguro(c) });
}

/**
 * Lê o cookie de sessão e coloca o usuário em `c.get("usuario")`, ou null.
 * Cookie adulterado, expirado ou de senha antiga é tratado como sem sessão.
 */
export const carregarUsuario: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("usuario", null);

  const valor = await getSignedCookie(c, segredo(c), COOKIE);
  if (valor) {
    const [id, expiraEm, impressao] = valor.split(".");
    if (Number(expiraEm) > Math.floor(Date.now() / 1000)) {
      const db: Client = await c.get("db")();
      const { rows } = await db.query<UsuarioSessao & { password_hash: string }>(
        "SELECT id, name, email, password_hash FROM users WHERE id = $1",
        [Number(id)],
      );
      const usuario = rows[0];
      if (usuario && (await impressaoDaSenha(usuario.password_hash)) === impressao) {
        c.set("usuario", { id: usuario.id, name: usuario.name, email: usuario.email });
      }
    }
  }

  await next();
};

/** Garante sessão nas rotas da API; sem sessão responde 401 em JSON. */
export const exigirLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("usuario")) {
    throw new AppError("Sessão expirada. Faça login novamente.", 401, "unauthorized");
  }
  await next();
};

export function usuarioAtual(c: Context<AppEnv>): UsuarioSessao {
  const usuario = c.get("usuario");
  if (!usuario) throw new AppError("Sessão expirada. Faça login novamente.", 401, "unauthorized");
  return usuario;
}
