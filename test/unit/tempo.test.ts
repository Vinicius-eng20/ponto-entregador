import { describe, expect, it } from "vitest";

import {
  agoraLocal,
  dataIso,
  diaDaSemana,
  formatarHoras,
  minutosTrabalhados,
  segundosTrabalhados,
  ultimoDiaDoMes,
} from "../../src/lib/time";

describe("agoraLocal", () => {
  it("converte UTC para a data e hora de São Paulo", () => {
    expect(agoraLocal("America/Sao_Paulo", new Date("2026-11-24T15:07:09Z"))).toEqual({
      data: "2026-11-24",
      hora: "12:07:09",
    });
  });

  it("de madrugada em UTC ainda é o dia anterior em São Paulo", () => {
    expect(agoraLocal("America/Sao_Paulo", new Date("2026-11-24T02:30:00Z"))).toEqual({
      data: "2026-11-23",
      hora: "23:30:00",
    });
  });

  it("usa o relógio de 24 horas", () => {
    expect(agoraLocal("America/Sao_Paulo", new Date("2026-11-24T03:05:00Z")).hora).toBe("00:05:00");
  });
});

describe("diaDaSemana", () => {
  it.each([
    ["2026-09-13", "Domingo"],
    ["2026-09-15", "Terça-feira"],
    ["2026-09-10", "Quinta-feira"],
    ["2026-11-21", "Sábado"],
    ["2028-02-29", "Terça-feira"],
  ])("%s é %s", (data, esperado) => {
    expect(diaDaSemana(data)).toBe(esperado);
  });
});

describe("horas trabalhadas", () => {
  it("calcula a diferença dentro do mesmo dia", () => {
    expect(minutosTrabalhados("10:07:00", "13:15:00")).toBe(188);
    expect(formatarHoras(188)).toBe("03:08");
  });

  it("turno que passa da meia-noite soma o dia seguinte", () => {
    expect(minutosTrabalhados("22:30:00", "01:15:00")).toBe(165);
  });

  it("subtrai com segundos e só depois descarta o que sobra (como o Flask)", () => {
    // 10:07:30 -> 13:15:10 = 3h07m40s -> 03:07
    expect(minutosTrabalhados("10:07:30", "13:15:10")).toBe(187);
    expect(segundosTrabalhados("10:07:30", "13:15:10")).toBe(11260);
  });

  it("aceita horário sem segundos", () => {
    expect(minutosTrabalhados("09:00", "13:00")).toBe(240);
  });

  it("turno em aberto não tem horas", () => {
    expect(minutosTrabalhados("10:00:00", null)).toBeNull();
    expect(formatarHoras(null)).toBeNull();
  });

  it("formata com zeros à esquerda e passa de 24h se preciso", () => {
    expect(formatarHoras(0)).toBe("00:00");
    expect(formatarHoras(64)).toBe("01:04");
    expect(formatarHoras(1500)).toBe("25:00");
  });
});

describe("datas", () => {
  it("último dia do mês, incluindo ano bissexto", () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2028, 2)).toBe(29);
    expect(ultimoDiaDoMes(2026, 9)).toBe(30);
    expect(ultimoDiaDoMes(2026, 12)).toBe(31);
  });

  it("monta AAAA-MM-DD com zeros", () => {
    expect(dataIso(2026, 3, 7)).toBe("2026-03-07");
  });
});
