import { describe, expect, it } from "vitest";

import { paraApi } from "../../src/lib/registro";
import { semanasDoMes } from "../../src/services/dashboard";

describe("semanasDoMes (domingo a sábado)", () => {
  it("outubro/2026 começa no domingo 27/09 e tem a semana 18/10 a 24/10", () => {
    const semanas = semanasDoMes(2026, 10);
    expect(semanas.map((s) => s.label)).toEqual([
      "27/09 a 03/10",
      "04/10 a 10/10",
      "11/10 a 17/10",
      "18/10 a 24/10",
      "25/10 a 31/10",
    ]);
    expect(semanas[0]).toEqual({
      week: 1,
      from: "2026-09-27",
      to: "2026-10-03",
      label: "27/09 a 03/10",
    });
  });

  it("mês que começa no domingo não puxa dias do mês anterior", () => {
    expect(semanasDoMes(2026, 11)[0].from).toBe("2026-11-01");
  });

  it("fevereiro/2026 cabe em exatamente 4 semanas", () => {
    const semanas = semanasDoMes(2026, 2);
    expect(semanas).toHaveLength(4);
    expect(semanas.at(-1)?.to).toBe("2026-02-28");
  });

  it("agosto/2026 (começa no sábado) tem 6 semanas", () => {
    const semanas = semanasDoMes(2026, 8);
    expect(semanas).toHaveLength(6);
    expect(semanas[0].label).toBe("26/07 a 01/08");
    expect(semanas.at(-1)?.label).toBe("30/08 a 05/09");
  });

  it("dezembro cruza a virada do ano", () => {
    expect(semanasDoMes(2026, 12).at(-1)).toMatchObject({ from: "2026-12-27", to: "2027-01-02" });
  });

  it("toda semana tem 7 dias e começa num domingo", () => {
    for (let mes = 1; mes <= 12; mes++) {
      for (const s of semanasDoMes(2027, mes)) {
        expect(new Date(`${s.from}T00:00:00Z`).getUTCDay()).toBe(0);
        const dias =
          (Date.parse(`${s.to}T00:00:00Z`) - Date.parse(`${s.from}T00:00:00Z`)) / 86_400_000;
        expect(dias).toBe(6);
      }
    }
  });
});

describe("paraApi (formato do registro na API)", () => {
  it("calcula dia da semana e horas, e corta os segundos dos horários", () => {
    expect(
      paraApi({
        id: 7,
        user_id: 1,
        date: "2026-09-13",
        start_time: "10:07:00",
        end_time: "13:15:00",
        earnings: 50.38,
        costs: 19.59,
      }),
    ).toEqual({
      id: 7,
      date: "2026-09-13",
      weekday: "Domingo",
      start_time: "10:07",
      end_time: "13:15",
      earnings: 50.38,
      costs: 19.59,
      worked_hours: "03:08",
    });
  });

  it("turno em aberto: sem saída, valores e horas", () => {
    const r = paraApi({
      id: 1,
      user_id: 1,
      date: "2026-11-24",
      start_time: "09:00:00",
      end_time: null,
      earnings: null,
      costs: null,
    });
    expect(r).toMatchObject({ end_time: null, earnings: null, costs: null, worked_hours: null });
  });
});
