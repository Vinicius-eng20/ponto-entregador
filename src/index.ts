import { type Context, Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { conexaoPorRequisicao } from "./db";
import { AppError } from "./lib/errors";
import { rotasApi } from "./routes/api";
import { rotasAuth } from "./routes/auth";
import { carregarUsuario, exigirLogin } from "./sessao";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// Log de cada requisição em JSON (aparece no Workers Logs).
app.use("*", async (c, next) => {
  const inicio = Date.now();
  await next();
  console.log(
    JSON.stringify({
      evento: "requisicao",
      metodo: c.req.method,
      caminho: c.req.path,
      status: c.res.status,
      ms: Date.now() - inicio,
      user_id: c.get("usuario")?.id ?? null,
    }),
  );
});

app.use("*", secureHeaders());
app.use("*", conexaoPorRequisicao);

// Formulários de outros sites não podem chamar a API (veja docs/migracao-workers.md).
app.use("/api/*", csrf());

app.get("/health", async (c) => {
  try {
    const db = await c.get("db")();
    await db.query("SELECT 1");
    return c.json({ status: "ok", banco: "ok" });
  } catch (erro) {
    console.error(JSON.stringify({ evento: "health_falhou", erro: String(erro) }));
    return c.json({ status: "erro", banco: "indisponivel" }, 503);
  }
});

// ---- API -------------------------------------------------------------------

app.route("/api/auth", rotasAuth);
app.use("/api/*", carregarUsuario, exigirLogin);
app.route("/api", rotasApi);

// ---- Páginas com controle de acesso ----------------------------------------
// As demais (landing, CSS, JS) saem direto dos arquivos estáticos, sem passar
// pelo Worker. Ver "assets.run_worker_first" no wrangler.jsonc.

async function servirPagina(c: Context<AppEnv>, caminho: string): Promise<Response> {
  const resposta = (await c.env.ASSETS.fetch(
    new URL(caminho, c.req.url).toString(),
  )) as unknown as Response;
  // A resposta dos assets tem cabeçalhos imutáveis; a cópia permite que os
  // middlewares (ex.: cabeçalhos de segurança) os completem.
  return new Response(resposta.body, resposta);
}

app.get("/app", carregarUsuario, async (c) =>
  c.get("usuario") ? servirPagina(c, "/app") : c.redirect("/login"),
);
app.get("/login", carregarUsuario, async (c) =>
  c.get("usuario") ? c.redirect("/app") : servirPagina(c, "/login"),
);
app.get("/cadastro", carregarUsuario, async (c) =>
  c.get("usuario") ? c.redirect("/app") : servirPagina(c, "/cadastro"),
);

// ---- Erros -----------------------------------------------------------------

app.notFound((c) =>
  c.req.path.startsWith("/api/")
    ? c.json({ error: "not_found", message: "Recurso não encontrado." }, 404)
    : servirPagina(c, "/404"),
);

app.onError((erro, c) => {
  if (erro instanceof AppError) {
    return c.json({ error: erro.code, message: erro.message }, erro.status);
  }
  if (erro instanceof HTTPException) {
    if (erro.status === 403) {
      return c.json({ error: "forbidden", message: "Requisição de origem não permitida." }, 403);
    }
    return erro.getResponse();
  }

  console.error(
    JSON.stringify({ evento: "erro_interno", caminho: c.req.path, erro: String(erro), stack: (erro as Error).stack }),
  );
  return c.req.path.startsWith("/api/")
    ? c.json({ error: "internal_error", message: "Erro interno do servidor." }, 500)
    : c.text("Erro interno do servidor.", 500);
});

export default app;
