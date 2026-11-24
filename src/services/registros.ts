import type { Client } from "pg";

import { AppError } from "../lib/errors";
import { COLUNAS_REGISTRO, type LinhaRegistro, paraApi, type RegistroApi } from "../lib/registro";
import { exigirCampos, lerData, lerHora, lerValor } from "../lib/validacao";

const CAMPOS = ["date", "start_time", "end_time", "earnings", "costs"];

function lerRegistroCompleto(dados: Record<string, unknown>) {
  exigirCampos(dados, CAMPOS);
  return [
    lerData(dados.date),
    lerHora(dados.start_time),
    lerHora(dados.end_time),
    lerValor(dados.earnings, "ganhos"),
    lerValor(dados.costs, "custos"),
  ] as const;
}

export const REGISTROS_POR_PAGINA = 10;

export interface PaginaRegistros {
  items: RegistroApi[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/**
 * Uma página de registros do usuário, mais recentes primeiro: data, depois
 * horário de entrada, e o id como desempate estável entre páginas.
 * Página além da última devolve `items` vazio com os totais corretos.
 */
export async function listarRegistros(
  db: Client,
  userId: number,
  pagina: number,
): Promise<PaginaRegistros> {
  const contagem = await db.query<{ total: number }>(
    "SELECT count(*)::int AS total FROM work_records WHERE user_id = $1",
    [userId],
  );
  const total = contagem.rows[0].total;

  const { rows } = await db.query<LinhaRegistro>(
    `SELECT ${COLUNAS_REGISTRO} FROM work_records
      WHERE user_id = $1
      ORDER BY date DESC, start_time DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [userId, REGISTROS_POR_PAGINA, (pagina - 1) * REGISTROS_POR_PAGINA],
  );

  return {
    items: rows.map(paraApi),
    page: pagina,
    per_page: REGISTROS_POR_PAGINA,
    total,
    total_pages: Math.max(1, Math.ceil(total / REGISTROS_POR_PAGINA)),
  };
}

/** Registro manual (botão +): todos os campos obrigatórios. */
export async function criarRegistro(
  db: Client,
  userId: number,
  dados: Record<string, unknown>,
): Promise<RegistroApi> {
  const [data, inicio, fim, ganhos, custos] = lerRegistroCompleto(dados);
  const { rows } = await db.query<LinhaRegistro>(
    `INSERT INTO work_records
       (user_id, date, start_time, end_time, earnings, costs, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     RETURNING ${COLUNAS_REGISTRO}`,
    [userId, data, inicio, fim, ganhos, custos],
  );
  return paraApi(rows[0]);
}

export async function atualizarRegistro(
  db: Client,
  userId: number,
  id: number,
  dados: Record<string, unknown>,
): Promise<RegistroApi> {
  const existe = await db.query("SELECT 1 FROM work_records WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  if (existe.rowCount === 0) throw new AppError("Registro não encontrado.", 404, "not_found");

  const [data, inicio, fim, ganhos, custos] = lerRegistroCompleto(dados);
  const { rows } = await db.query<LinhaRegistro>(
    `UPDATE work_records
        SET date = $1, start_time = $2, end_time = $3, earnings = $4, costs = $5, updated_at = now()
      WHERE id = $6 AND user_id = $7
      RETURNING ${COLUNAS_REGISTRO}`,
    [data, inicio, fim, ganhos, custos, id, userId],
  );
  return paraApi(rows[0]);
}

export async function excluirRegistro(db: Client, userId: number, id: number): Promise<void> {
  const resultado = await db.query("DELETE FROM work_records WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  if (resultado.rowCount === 0) throw new AppError("Registro não encontrado.", 404, "not_found");
}
