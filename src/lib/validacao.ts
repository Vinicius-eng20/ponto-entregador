import { AppError } from "./errors";

/** Valor máximo de NUMERIC(10, 2). */
const VALOR_MAXIMO = 99_999_999.99;

/**
 * Converte ganhos/custos para número com 2 casas. Aceita número ou texto,
 * com ponto ou vírgula decimal. Recusa vazio, texto inválido e negativo.
 */
export function lerValor(valor: unknown, campo: string): number {
  const texto = typeof valor === "number" ? String(valor) : String(valor ?? "").trim();
  const normalizado = texto.replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) {
    throw new AppError(`O campo '${campo}' deve ser um número válido.`);
  }

  const numero = Number(normalizado);
  if (numero < 0) {
    throw new AppError(`O campo '${campo}' não pode ser negativo.`);
  }
  if (numero > VALOR_MAXIMO) {
    throw new AppError(`O campo '${campo}' é grande demais.`);
  }
  return Math.round(numero * 100) / 100;
}

/** Valida AAAA-MM-DD e se a data existe no calendário. */
export function lerData(valor: unknown): string {
  const texto = String(valor ?? "");
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (partes) {
    const [ano, mes, dia] = partes.slice(1).map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (
      data.getUTCFullYear() === ano &&
      data.getUTCMonth() === mes - 1 &&
      data.getUTCDate() === dia
    ) {
      return texto;
    }
  }
  throw new AppError("Data inválida. Use o formato AAAA-MM-DD.");
}

/** Valida HH:MM (00:00 a 23:59) e devolve HH:MM:00 para o banco. */
export function lerHora(valor: unknown): string {
  const texto = String(valor ?? "");
  const partes = /^(\d{2}):(\d{2})$/.exec(texto);
  if (partes && Number(partes[1]) < 24 && Number(partes[2]) < 60) {
    return `${texto}:00`;
  }
  throw new AppError("Horário inválido. Use o formato HH:MM.");
}

/** Mesmo comportamento do Flask: lista os campos vazios ou ausentes. */
export function exigirCampos(dados: Record<string, unknown>, campos: string[]): void {
  const faltando = campos.filter((campo) => dados[campo] === undefined || dados[campo] === null || dados[campo] === "");
  if (faltando.length > 0) {
    throw new AppError(`Campos obrigatórios ausentes: ${faltando.join(", ")}.`);
  }
}

/** Lê um corpo JSON; corpo ausente ou inválido vira objeto vazio, como no Flask. */
export async function lerJson(requisicao: Request): Promise<Record<string, unknown>> {
  try {
    const dados = await requisicao.json();
    return dados && typeof dados === "object" && !Array.isArray(dados)
      ? (dados as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
