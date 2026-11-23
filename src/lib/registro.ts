import { diaDaSemana, formatarHoras, minutosTrabalhados } from "./time";

/** Linha da tabela work_records, como o driver devolve. */
export interface LinhaRegistro {
  id: number;
  user_id: number;
  date: string;
  start_time: string;
  end_time: string | null;
  earnings: number | null;
  costs: number | null;
}

/** Formato da API, idêntico ao to_dict() do Flask. */
export interface RegistroApi {
  id: number;
  date: string;
  weekday: string;
  start_time: string;
  end_time: string | null;
  earnings: number | null;
  costs: number | null;
  worked_hours: string | null;
}

export function paraApi(linha: LinhaRegistro): RegistroApi {
  return {
    id: linha.id,
    date: linha.date,
    weekday: diaDaSemana(linha.date),
    start_time: linha.start_time.slice(0, 5),
    end_time: linha.end_time ? linha.end_time.slice(0, 5) : null,
    earnings: linha.earnings,
    costs: linha.costs,
    worked_hours: formatarHoras(minutosTrabalhados(linha.start_time, linha.end_time)),
  };
}

export const COLUNAS_REGISTRO = "id, user_id, date, start_time, end_time, earnings, costs";
