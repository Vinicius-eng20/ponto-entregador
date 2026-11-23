// Formatação compartilhada. Datas e horas sempre no fuso de São Paulo,
// independente do fuso do aparelho.
const FUSO = "America/Sao_Paulo";

const Formato = {
  moeda(valor) {
    return Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  /** "2026-09-10" -> "10/09/2026" */
  data(iso) {
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
  },

  /** Data de hoje por extenso: "segunda-feira, 23 de novembro de 2026". */
  hojePorExtenso(agora = new Date()) {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: FUSO,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(agora);
  },

  /** Partes da data/hora atual em São Paulo. */
  agora(agora = new Date()) {
    const partes = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: FUSO,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(agora)
        .map((p) => [p.type, p.value]),
    );
    return {
      data: `${partes.year}-${partes.month}-${partes.day}`,
      hora: partes.hour,
      minuto: partes.minute,
      segundo: partes.second,
    };
  },

  /** Minutos como "1h05" ou "45 min". */
  duracao(minutos) {
    if (minutos < 60) return `${minutos} min`;
    return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
  },

  /** Minutos desde data+hora (em São Paulo) até agora. */
  minutosDesde(data, horaHHMM) {
    const agora = Formato.agora();
    const [h, m] = horaHHMM.split(":").map(Number);
    const inicio = Date.UTC(...data.split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0)), h, m);
    const fim = Date.UTC(
      ...agora.data.split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0)),
      Number(agora.hora),
      Number(agora.minuto),
    );
    return Math.max(0, Math.round((fim - inicio) / 60000));
  },
};
