import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { lerJson } from "../lib/validacao";
import { usuarioAtual } from "../sessao";
import { dadosDashboard, mesesDisponiveis } from "../services/dashboard";
import { concluirTurno, obterStatus, registrarEntrada, registrarSaida } from "../services/ponto";
import {
  atualizarRegistro,
  criarRegistro,
  excluirRegistro,
  listarRegistros,
} from "../services/registros";
import type { AppEnv } from "../types";

/** Rotas da API que exigem sessão (o middleware é aplicado em index.ts). */
export const rotasApi = new Hono<AppEnv>();

function log(evento: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento, ...dados }));
}

function idDaRota(valor: string): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Registro não encontrado.", 404, "not_found");
  return id;
}

// ---- Ponto -----------------------------------------------------------------

rotasApi.get("/clock/status", async (c) => {
  const db = await c.get("db")();
  return c.json(await obterStatus(db, usuarioAtual(c).id));
});

rotasApi.post("/clock/in", async (c) => {
  const usuario = usuarioAtual(c);
  const registro = await registrarEntrada(await c.get("db")(), usuario.id, c.env.TZ_APP);
  log("entrada", { user_id: usuario.id, record_id: registro.id });
  return c.json(registro, 201);
});

rotasApi.post("/clock/out", async (c) => {
  const usuario = usuarioAtual(c);
  const registro = await registrarSaida(await c.get("db")(), usuario.id, c.env.TZ_APP);
  log("saida", { user_id: usuario.id, record_id: registro.id });
  return c.json(registro);
});

rotasApi.post("/clock/close", async (c) => {
  const usuario = usuarioAtual(c);
  const dados = await lerJson(c.req.raw);
  const registro = await concluirTurno(
    await c.get("db")(),
    usuario.id,
    dados.earnings,
    dados.costs,
  );
  log("turno_concluido", { user_id: usuario.id, record_id: registro.id });
  return c.json(registro);
});

// ---- Registros -------------------------------------------------------------

rotasApi.get("/records", async (c) => {
  const db = await c.get("db")();
  return c.json(await listarRegistros(db, usuarioAtual(c).id));
});

rotasApi.post("/records", async (c) => {
  const usuario = usuarioAtual(c);
  const registro = await criarRegistro(await c.get("db")(), usuario.id, await lerJson(c.req.raw));
  log("registro_criado", { user_id: usuario.id, record_id: registro.id });
  return c.json(registro, 201);
});

rotasApi.put("/records/:id", async (c) => {
  const usuario = usuarioAtual(c);
  const registro = await atualizarRegistro(
    await c.get("db")(),
    usuario.id,
    idDaRota(c.req.param("id")),
    await lerJson(c.req.raw),
  );
  log("registro_atualizado", { user_id: usuario.id, record_id: registro.id });
  return c.json(registro);
});

rotasApi.delete("/records/:id", async (c) => {
  const usuario = usuarioAtual(c);
  const id = idDaRota(c.req.param("id"));
  await excluirRegistro(await c.get("db")(), usuario.id, id);
  log("registro_excluido", { user_id: usuario.id, record_id: id });
  return c.body(null, 204);
});

// ---- Dashboard -------------------------------------------------------------

rotasApi.get("/dashboard/months", async (c) => {
  const db = await c.get("db")();
  return c.json(await mesesDisponiveis(db, usuarioAtual(c).id, c.env.TZ_APP));
});

rotasApi.get("/dashboard", async (c) => {
  const ano = Number(c.req.query("year"));
  const mes = Number(c.req.query("month"));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !c.req.query("year") || !c.req.query("month")) {
    throw new AppError("Informe ano e mês válidos.", 400, "invalid_params");
  }

  const semanaTexto = c.req.query("week");
  let semana: number | null = null;
  if (semanaTexto) {
    semana = Number(semanaTexto);
    if (!Number.isInteger(semana)) throw new AppError("Semana inválida.", 400, "invalid_params");
  }

  const db = await c.get("db")();
  return c.json(await dadosDashboard(db, usuarioAtual(c).id, ano, mes, semana));
});
