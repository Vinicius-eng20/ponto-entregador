/**
 * Data e hora "de parede" no fuso do app (America/Sao_Paulo por padrão).
 *
 * O Worker roda em UTC, então a data e a hora do ponto são calculadas com
 * Intl, que conhece o fuso e o horário de verão.
 */
export interface DataHoraLocal {
  /** AAAA-MM-DD */
  data: string;
  /** HH:MM:SS */
  hora: string;
}

export function agoraLocal(timeZone: string, agora: Date = new Date()): DataHoraLocal {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);

  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "00";

  return {
    data: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${valor("hour")}:${valor("minute")}:${valor("second")}`,
  };
}

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** Dia da semana de uma data AAAA-MM-DD (calculado em UTC, sem efeito de fuso). */
export function diaDaSemana(data: string): string {
  return DIAS_SEMANA[new Date(`${data}T00:00:00Z`).getUTCDay()];
}

function segundosDoDia(hora: string): number {
  const [h, m, seg = 0] = hora.split(":").map(Number);
  return h * 3600 + m * 60 + seg;
}

/**
 * Segundos trabalhados entre entrada e saída. Se a saída for menor que a
 * entrada, o turno passou da meia-noite (mesma regra do app Flask).
 */
export function segundosTrabalhados(inicio: string, fim: string | null): number | null {
  if (!fim) return null;
  const diferenca = segundosDoDia(fim) - segundosDoDia(inicio);
  return diferenca < 0 ? diferenca + 24 * 3600 : diferenca;
}

/** Minutos trabalhados, descartando os segundos que sobram (como o Flask). */
export function minutosTrabalhados(inicio: string, fim: string | null): number | null {
  const segundos = segundosTrabalhados(inicio, fim);
  return segundos === null ? null : Math.floor(segundos / 60);
}

/** Formata minutos como HH:MM. */
export function formatarHoras(minutos: number | null): string | null {
  if (minutos === null) return null;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Último dia (28–31) de um mês. */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function dataIso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
