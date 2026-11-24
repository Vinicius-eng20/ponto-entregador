import bcrypt from "bcryptjs";
import { Hono } from "hono";
import type { Client } from "pg";

import { AppError } from "../lib/errors";
import { lerJson } from "../lib/validacao";
import { carregarUsuario, encerrarSessao, iniciarSessao, usuarioAtual } from "../sessao";
import type { AppEnv } from "../types";

export const rotasAuth = new Hono<AppEnv>();

function custoBcrypt(valor: string | undefined): number {
  const custo = Number(valor ?? 10);
  return Number.isInteger(custo) && custo >= 4 && custo <= 14 ? custo : 10;
}

/** Hashes que não são bcrypt (ex.: scrypt do Werkzeug, do app Flask) nunca conferem. */
async function senhaConfere(senha: string, hash: string): Promise<boolean> {
  if (!/^\$2[aby]\$/.test(hash)) return false;
  return bcrypt.compare(senha, hash);
}

function log(evento: string, dados: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ evento, ...dados }));
}

rotasAuth.post("/register", async (c) => {
  const dados = await lerJson(c.req.raw);
  const nome = String(dados.name ?? "").trim();
  const email = String(dados.email ?? "")
    .trim()
    .toLowerCase();
  const senha = String(dados.password ?? "");
  const confirmacao = String(dados.password_confirm ?? "");

  if (!nome || !email || !senha) throw new AppError("Preencha todos os campos.");
  if (senha !== confirmacao) throw new AppError("As senhas não coincidem.");
  if (senha.length < 6) throw new AppError("A senha deve ter pelo menos 6 caracteres.");
  // bcrypt só considera os primeiros 72 bytes da senha.
  if (new TextEncoder().encode(senha).length > 72) {
    throw new AppError("A senha deve ter no máximo 72 caracteres.");
  }
  if (nome.length > 100 || email.length > 255) throw new AppError("Nome ou e-mail longo demais.");

  const db: Client = await c.get("db")();
  const existente = await db.query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (existente.rowCount) throw new AppError("Já existe uma conta com este e-mail.");

  const hash = await bcrypt.hash(senha, custoBcrypt(c.env.BCRYPT_COST));
  let usuario: { id: number; name: string; email: string; password_hash: string };
  try {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, created_at)
       VALUES ($1, $2, $3, now())
       RETURNING id, name, email, password_hash`,
      [nome, email, hash],
    );
    usuario = rows[0];
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      throw new AppError("Já existe uma conta com este e-mail.");
    }
    throw erro;
  }

  await iniciarSessao(c, usuario);
  log("cadastro", { user_id: usuario.id });
  return c.json({ user: { id: usuario.id, name: usuario.name, email: usuario.email } }, 201);
});

rotasAuth.post("/login", async (c) => {
  const dados = await lerJson(c.req.raw);
  const email = String(dados.email ?? "")
    .trim()
    .toLowerCase();
  const senha = String(dados.password ?? "");

  const db: Client = await c.get("db")();
  const { rows } = await db.query<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
  }>("SELECT id, name, email, password_hash FROM users WHERE email = $1", [email]);
  const usuario = rows[0];

  if (!usuario || !(await senhaConfere(senha, usuario.password_hash))) {
    log("login_falhou", { motivo: usuario ? "senha" : "email" });
    throw new AppError("E-mail ou senha inválidos.", 401, "invalid_credentials");
  }

  await iniciarSessao(c, usuario);
  log("login", { user_id: usuario.id });
  return c.json({ user: { id: usuario.id, name: usuario.name, email: usuario.email } });
});

rotasAuth.post("/logout", (c) => {
  encerrarSessao(c);
  return c.body(null, 204);
});

rotasAuth.get("/me", carregarUsuario, (c) => c.json({ user: usuarioAtual(c) }));
