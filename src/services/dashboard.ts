import type { Client } from "pg";

import { AppError } from "../lib/errors";
import { agoraLocal, dataIso, diaDaSemana, segundosTrabalhados, ultimoDiaDoMes } from "../lib/time";

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

export interface SemanaDoMes {
  week: number;
  from: string;
  to: string;
  label: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const isoUtc = (d: Date) => d.toISOString().slice(0, 10);
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Semanas reais (domingo a sábado) que têm pelo menos um dia no mês. A
 * primeira começa no domingo da semana do dia 1, e a última termina no
 * sábado da semana do último dia, então podem incluir dias dos meses
 * vizinhos (ex.: outubro de 2026 começa em 27/09 a 03/10).
 */
export function semanasDoMes(ano: number, mes: number): SemanaDoMes[] {
  const primeiroDia = new Date(Date.UTC(ano, mes - 1, 1));
  const ultimoDia = new Date(Date.UTC(ano, mes - 1, ultimoDiaDoMes(ano, mes)));
  const semanas: SemanaDoMes[] = [];

  let inicio = new Date(primeiroDia.getTime() - primeiroDia.getUTCDay() * DIA_MS);
  while (inicio <= ultimoDia) {
    const fim = new Date(inicio.getTime() + 6 * DIA_MS);
    const de = isoUtc(inicio);
    const ate = isoUtc(fim);
    semanas.push({ week: semanas.length + 1, from: de, to: ate, label: `${diaMes(de)} a ${diaMes(ate)}` });
    inicio = new Date(inicio.getTime() + 7 * DIA_MS);
  }
  return semanas;
}

interface TotaisDoDia {
  date: string;
  ganhos: number;
  custos: number;
  lucro: number;
}

interface DiaDestaque {
  date: string;
  date_label: string;
  weekday: string;
  earnings: number;
  costs: number;
  profit: number;
}

function destaque(dia: TotaisDoDia | undefined): DiaDestaque | null {
  if (!dia) return null;
  return {
    date: dia.date,
    date_label: diaMes(dia.date),
    weekday: diaDaSemana(dia.date),
    earnings: dia.ganhos / 100,
    costs: dia.custos / 100,
    profit: dia.lucro / 100,
  };
}

/**
 * Dia de maior e de menor lucro (ganhos − custos de todos os turnos do dia).
 * Em empate, vale o dia mais recente.
 */
function diasDestaque(dias: TotaisDoDia[]) {
  let maior: TotaisDoDia | undefined;
  let menor: TotaisDoDia | undefined;
  // `dias` vem em ordem crescente de data: com >= e <=, o mais recente vence o empate.
  for (const dia of dias) {
    if (!maior || dia.lucro >= maior.lucro) maior = dia;
    if (!menor || dia.lucro <= menor.lucro) menor = dia;
  }
  return { most_profitable_day: destaque(maior), least_profitable_day: destaque(menor) };
}

export async function dadosDashboard(
  db: Client,
  userId: number,
  ano: number,
  mes: number,
  semana: number | null,
) {
  if (mes < 1 || mes > 12) throw new AppError("Mês inválido.", 400, "invalid_params");
  if (ano < 2000 || ano > 2100) throw new AppError("Ano inválido.", 400, "invalid_params");

  const semanas = semanasDoMes(ano, mes);
  let de = dataIso(ano, mes, 1);
  let ate = dataIso(ano, mes, ultimoDiaDoMes(ano, mes));
  if (semana !== null) {
    const escolhida = semanas[semana - 1];
    if (!escolhida) {
      throw new AppError("Semana inválida para o mês selecionado.", 400, "invalid_params");
    }
    ({ from: de, to: ate } = escolhida);
  }

  // Só turnos concluídos (com ganhos) entram nas contas.
  const filtro = "user_id = $1 AND earnings IS NOT NULL AND date BETWEEN $2 AND $3";

  // Totais por dia, agregados no banco. Valores em centavos para somar sem
  // erro de ponto flutuante.
  const porDia = await db.query<TotaisDoDia>(
    `SELECT date,
            (SUM(earnings) * 100)::bigint                        AS ganhos,
            (SUM(COALESCE(costs, 0)) * 100)::bigint               AS custos,
            (SUM(earnings - COALESCE(costs, 0)) * 100)::bigint    AS lucro
       FROM work_records
      WHERE ${filtro}
      GROUP BY date
      ORDER BY date ASC`,
    [userId, de, ate],
  );
  const dias = porDia.rows.map((d) => ({
    date: d.date,
    ganhos: Number(d.ganhos),
    custos: Number(d.custos),
    lucro: Number(d.lucro),
  }));

  // Horas de cada turno, para a média por turno.
  const turnos = await db.query<{ start_time: string; end_time: string | null }>(
    `SELECT start_time, end_time FROM work_records WHERE ${filtro}`,
    [userId, de, ate],
  );
  const segundos = turnos.rows
    .map((t) => segundosTrabalhados(t.start_time, t.end_time))
    .filter((s): s is number => s !== null);
  let mediaHoras: string | null = null;
  if (segundos.length > 0) {
    const media = Math.floor(segundos.reduce((a, b) => a + b, 0) / segundos.length);
    const h = Math.floor(media / 3600);
    const m = Math.floor((media % 3600) / 60);
    mediaHoras = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const totalGanhos = dias.reduce((soma, d) => soma + d.ganhos, 0);
  const totalCustos = dias.reduce((soma, d) => soma + d.custos, 0);

  return {
    period: { from: de, to: ate },
    week: semana,
    weeks: semanas,
    total_earnings: totalGanhos / 100,
    total_costs: totalCustos / 100,
    total_profit: (totalGanhos - totalCustos) / 100,
    avg_worked_hours: mediaHoras,
    cost_ratio_percent:
      totalGanhos > 0 ? Math.round((totalCustos / totalGanhos) * 1000) / 10 : null,
    days_worked: turnos.rowCount ?? 0,
    ...diasDestaque(dias),
    daily_earnings: dias.map((d) => ({
      date: d.date,
      date_label: diaMes(d.date),
      earnings: d.ganhos / 100,
      profit: d.lucro / 100,
    })),
  };
}
