import type { Client } from "pg";

import { AppError } from "../lib/errors";
import { COLUNAS_REGISTRO, type LinhaRegistro, paraApi, type RegistroApi } from "../lib/registro";
import { agoraLocal } from "../lib/time";
import { lerValor } from "../lib/validacao";

export type EstadoPonto = "idle" | "working" | "awaiting_totals";

async function turnoAberto(db: Client, userId: number): Promise<LinhaRegistro | null> {
  const { rows } = await db.query<LinhaRegistro>(
    `SELECT ${COLUNAS_REGISTRO} FROM work_records
      WHERE user_id = $1 AND end_time IS NULL
      ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function turnoAguardandoTotais(db: Client, userId: number): Promise<LinhaRegistro | null> {
  const { rows } = await db.query<LinhaRegistro>(
    `SELECT ${COLUNAS_REGISTRO} FROM work_records
      WHERE user_id = $1 AND end_time IS NOT NULL AND earnings IS NULL
      ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Estado do ciclo: idle → working → awaiting_totals → idle. */
export async function obterStatus(
  db: Client,
  userId: number,
): Promise<{ state: EstadoPonto; record: RegistroApi | null }> {
  const aberto = await turnoAberto(db, userId);
  if (aberto) return { state: "working", record: paraApi(aberto) };

  const aguardando = await turnoAguardandoTotais(db, userId);
  if (aguardando) return { state: "awaiting_totals", record: paraApi(aguardando) };

  return { state: "idle", record: null };
}

export async function registrarEntrada(
  db: Client,
  userId: number,
  timeZone: string,
): Promise<RegistroApi> {
  if (await turnoAberto(db, userId)) {
    throw new AppError(
      "Já existe um turno em aberto. Registre a saída antes de uma nova entrada.",
      409,
      "invalid_state",
    );
  }
  if (await turnoAguardandoTotais(db, userId)) {
    throw new AppError(
      "Existe um turno aguardando ganhos e custos. Conclua-o antes de iniciar outro.",
      409,
      "invalid_state",
    );
  }

  const { data, hora } = agoraLocal(timeZone);
  try {
    const { rows } = await db.query<LinhaRegistro>(
      `INSERT INTO work_records (user_id, date, start_time, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       RETURNING ${COLUNAS_REGISTRO}`,
      [userId, data, hora],
    );
    return paraApi(rows[0]);
  } catch (erro) {
    // Duas entradas quase simultâneas: o índice único ux_open_shift_per_user barra a segunda.
    if ((erro as { code?: string }).code === "23505") {
      throw new AppError("Já existe um turno em aberto.", 409, "invalid_state");
    }
    throw erro;
  }
}

export async function registrarSaida(
  db: Client,
  userId: number,
  timeZone: string,
): Promise<RegistroApi> {
  const aberto = await turnoAberto(db, userId);
  if (!aberto) {
    throw new AppError("Não há turno em aberto para registrar a saída.", 409, "invalid_state");
  }

  const { hora } = agoraLocal(timeZone);
  const { rows } = await db.query<LinhaRegistro>(
    `UPDATE work_records SET end_time = $1, updated_at = now()
      WHERE id = $2
      RETURNING ${COLUNAS_REGISTRO}`,
    [hora, aberto.id],
  );
  return paraApi(rows[0]);
}

export async function concluirTurno(
  db: Client,
  userId: number,
  ganhos: unknown,
  custos: unknown,
): Promise<RegistroApi> {
  const aguardando = await turnoAguardandoTotais(db, userId);
  if (!aguardando) {
    throw new AppError("Não há turno aguardando ganhos e custos.");
  }

  const { rows } = await db.query<LinhaRegistro>(
    `UPDATE work_records SET earnings = $1, costs = $2, updated_at = now()
      WHERE id = $3
      RETURNING ${COLUNAS_REGISTRO}`,
    [lerValor(ganhos, "ganhos"), lerValor(custos, "custos"), aguardando.id],
  );
  return paraApi(rows[0]);
}
