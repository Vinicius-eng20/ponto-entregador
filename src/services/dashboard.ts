import type { Client } from "pg";

import { AppError } from "../lib/errors";
import { agoraLocal, dataIso, segundosTrabalhados, ultimoDiaDoMes } from "../lib/time";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface MesDisponivel {
  year: number;
  month: number;
  label: string;
}

/**
 * Meses com pelo menos um turno concluído, do mais recente ao mais antigo.
 * O mês atual sempre aparece, mesmo sem registros.
 */
export async function mesesDisponiveis(
  db: Client,
  userId: number,
  timeZone: string,
): Promise<MesDisponivel[]> {
  const { rows } = await db.query<{ ano: number; mes: number }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS ano, EXTRACT(MONTH FROM date)::int AS mes
       FROM work_records
      WHERE user_id = $1 AND earnings IS NOT NULL`,
    [userId],
  );

  const [anoAtual, mesAtual] = agoraLocal(timeZone).data.split("-").map(Number);
  const chaves = new Set(rows.map((r) => r.ano * 100 + r.mes));
  chaves.add(anoAtual * 100 + mesAtual);

  return [...chaves]
    .sort((a, b) => b - a)
    .map((chave) => {
      const year = Math.floor(chave / 100);
      const month = chave % 100;
      return { year, month, label: `${MESES[month - 1]} de ${year}` };
    });
}

/** Período do filtro: mês inteiro ou bloco de 7 dias (1–7, 8–14, ...). */
function periodo(ano: number, mes: number, semana: number | null): { de: string; ate: string } {
  const ultimoDia = ultimoDiaDoMes(ano, mes);
  if (!semana) return { de: dataIso(ano, mes, 1), ate: dataIso(ano, mes, ultimoDia) };

  const inicio = (semana - 1) * 7 + 1;
  if (semana < 1 || inicio > ultimoDia) {
    throw new AppError("Semana inválida para o mês selecionado.", 400, "invalid_params");
  }
  return { de: dataIso(ano, mes, inicio), ate: dataIso(ano, mes, Math.min(inicio + 6, ultimoDia)) };
}

export async function dadosDashboard(
  db: Client,
  userId: number,
  ano: number,
  mes: number,
  semana: number | null,
) {
  if (mes < 1 || mes > 12) throw new AppError("Mês inválido.", 400, "invalid_params");
  const { de, ate } = periodo(ano, mes, semana);

  // Só turnos concluídos (com ganhos) entram nas contas.
  const { rows } = await db.query<{
    date: string;
    start_time: string;
    end_time: string | null;
    earnings: number;
    costs: number;
  }>(
    `SELECT date, start_time, end_time, earnings, costs
       FROM work_records
      WHERE user_id = $1 AND earnings IS NOT NULL AND date BETWEEN $2 AND $3
      ORDER BY date ASC`,
    [userId, de, ate],
  );

  // Somas em centavos para não acumular erro de ponto flutuante.
  const centavos = (v: number) => Math.round(v * 100);
  const totalGanhos = rows.reduce((soma, r) => soma + centavos(r.earnings), 0);
  const totalCustos = rows.reduce((soma, r) => soma + centavos(r.costs ?? 0), 0);

  const segundos = rows
    .map((r) => segundosTrabalhados(r.start_time, r.end_time))
    .filter((s): s is number => s !== null);
  let mediaHoras: string | null = null;
  if (segundos.length > 0) {
    const media = Math.floor(segundos.reduce((a, b) => a + b, 0) / segundos.length);
    const h = Math.floor(media / 3600);
    const m = Math.floor((media % 3600) / 60);
    mediaHoras = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const porDia = new Map<string, number>();
  for (const r of rows) porDia.set(r.date, (porDia.get(r.date) ?? 0) + centavos(r.earnings));

  return {
    period: { from: de, to: ate },
    total_earnings: totalGanhos / 100,
    total_costs: totalCustos / 100,
    avg_worked_hours: mediaHoras,
    cost_ratio_percent:
      totalGanhos > 0 ? Math.round((totalCustos / totalGanhos) * 1000) / 10 : null,
    days_worked: rows.length,
    daily_earnings: [...porDia.entries()].map(([data, valor]) => ({
      date: data,
      date_label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
      earnings: valor / 100,
    })),
  };
}
