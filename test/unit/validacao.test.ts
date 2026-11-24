import { describe, expect, it } from "vitest";

import { AppError } from "../../src/lib/errors";
import { exigirCampos, lerData, lerHora, lerValor } from "../../src/lib/validacao";

describe("lerValor (ganhos e custos)", () => {
  it.each([
    [50, 50],
    ["50.38", 50.38],
    ["45,90", 45.9],
    [" 8.5 ", 8.5],
    ["0", 0],
    ["10.005", 10.01],
    ["1.005", 1.01],
    ["1.004", 1],
    ["0.995", 1],
    ["-0", 0],
    ["99999999.99", 99999999.99],
  ])("%j vira %j", (entrada, esperado) => {
    expect(lerValor(entrada, "ganhos")).toBe(esperado);
  });

  it.each(["abc", "", "1,2,3", "1e5", null, undefined, "R$ 10"])("recusa %j", (entrada) => {
    expect(() => lerValor(entrada, "ganhos")).toThrow(
      "O campo 'ganhos' deve ser um número válido.",
    );
  });

  it("recusa negativo com mensagem própria", () => {
    expect(() => lerValor("-5", "custos")).toThrow("O campo 'custos' não pode ser negativo.");
  });

  it("recusa valor acima do NUMERIC(10, 2)", () => {
    expect(() => lerValor("100000000", "ganhos")).toThrow("O campo 'ganhos' é grande demais.");
  });

  it("o erro é de validação (400)", () => {
    try {
      lerValor("x", "ganhos");
    } catch (erro) {
      expect(erro).toBeInstanceOf(AppError);
      expect((erro as AppError).status).toBe(400);
    }
  });
});

describe("lerData", () => {
  it("aceita datas reais, incluindo 29/02 de ano bissexto", () => {
    expect(lerData("2026-09-10")).toBe("2026-09-10");
    expect(lerData("2028-02-29")).toBe("2028-02-29");
  });

  it.each(["2026-02-30", "2026-02-29", "2026-13-01", "10/09/2026", "2026-9-1", "", null])(
    "recusa %j",
    (entrada) => {
      expect(() => lerData(entrada)).toThrow("Data inválida. Use o formato AAAA-MM-DD.");
    },
  );
});

describe("lerHora", () => {
  it("aceita HH:MM e completa os segundos", () => {
    expect(lerHora("09:05")).toBe("09:05:00");
    expect(lerHora("23:59")).toBe("23:59:00");
    expect(lerHora("00:00")).toBe("00:00:00");
  });

  it.each(["24:00", "12:60", "9:05", "09:05:00", "", null])("recusa %j", (entrada) => {
    expect(() => lerHora(entrada)).toThrow("Horário inválido. Use o formato HH:MM.");
  });
});

describe("exigirCampos", () => {
  it("lista os campos vazios ou ausentes, na ordem pedida", () => {
    expect(() => exigirCampos({ a: 1, b: "", c: null }, ["a", "b", "c", "d"])).toThrow(
      "Campos obrigatórios ausentes: b, c, d.",
    );
  });

  it("zero conta como preenchido", () => {
    expect(() => exigirCampos({ costs: 0 }, ["costs"])).not.toThrow();
  });
});
