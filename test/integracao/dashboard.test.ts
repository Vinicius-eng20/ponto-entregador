import { beforeEach, describe, expect, it } from "vitest";

import { criarTurno, hojeSP, limparBanco, Navegador, novaConta } from "../helpers";

beforeEach(limparBanco);

/** Dados da planilha original (setembro/2026). */
async function contaComSetembro() {
  const nav = await novaConta();
  const turnos: [string, string, string, string, string][] = [
    ["2026-09-13", "10:07", "13:15", "50.38", "19.59"],
    ["2026-09-15", "10:54", "11:58", "23.72", "4.80"],
    ["2026-09-16", "10:00", "13:33", "30.25", "6.00"],
    ["2026-09-17", "11:03", "14:16", "57.90", "10.00"],
    ["2026-09-18", "10:16", "13:36", "34.43", "13.20"],
    ["2026-09-19", "18:23", "21:31", "51.00", "1.60"],
    ["2026-09-20", "11:03", "15:03", "85.48", "12.20"],
  ];
  for (const t of turnos) await criarTurno(nav, ...t);
  return nav;
}

describe("meses disponíveis", () => {
  it("sem registros, só o mês atual", async () => {
    const nav = await novaConta();
    const [ano, mes] = hojeSP().split("-").map(Number);
    expect((await nav.get("/api/dashboard/months")).corpo).toEqual([
      { year: ano, month: mes, label: expect.stringMatching(new RegExp(`de ${ano}$`)) },
    ]);
  });

  it("meses com turnos concluídos, do mais recente ao mais antigo", async () => {
    const nav = await contaComSetembro();
    await criarTurno(nav, "2025-12-05", "10:00", "11:00", 10, 1);
    const meses = (await nav.get("/api/dashboard/months")).corpo;
    expect(meses).toContainEqual({ year: 2026, month: 9, label: "Setembro de 2026" });
    expect(meses).toContainEqual({ year: 2025, month: 12, label: "Dezembro de 2025" });
    const chaves = meses.map((m: { year: number; month: number }) => m.year * 100 + m.month);
    expect(chaves).toEqual([...chaves].sort((a, b) => b - a));
  });

  it("turno em aberto não cria mês", async () => {
    const nav = await novaConta();
    await nav.post("/api/clock/in");
    expect((await nav.get("/api/dashboard/months")).corpo).toHaveLength(1);
  });
});

describe("indicadores do mês", () => {
  it("bate com a planilha original de setembro/2026", async () => {
    const nav = await contaComSetembro();
    const d = (await nav.get("/api/dashboard?year=2026&month=9")).corpo;

    expect(d.period).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(d.week).toBeNull();
    expect(d.total_earnings).toBe(333.16);
    expect(d.total_costs).toBe(67.39);
    expect(d.total_profit).toBe(265.77);
    expect(d.cost_ratio_percent).toBe(20.2);
    expect(d.days_worked).toBe(7);
    // 188 + 64 + 213 + 193 + 200 + 188 + 240 = 1286 min / 7 turnos = 183,7 min
    expect(d.avg_worked_hours).toBe("03:03");
    expect(d.daily_earnings).toHaveLength(7);
    expect(d.daily_earnings[0]).toEqual({
      date: "2026-09-13",
      date_label: "13/09",
      earnings: 50.38,
      profit: 30.79,
    });
  });

  it("dia mais e menos lucrativo", async () => {
    const nav = await contaComSetembro();
    const d = (await nav.get("/api/dashboard?year=2026&month=9")).corpo;
    expect(d.most_profitable_day).toEqual({
      date: "2026-09-20",
      date_label: "20/09",
      weekday: "Domingo",
      earnings: 85.48,
      costs: 12.2,
      profit: 73.28,
    });
    expect(d.least_profitable_day).toMatchObject({
      date: "2026-09-15",
      weekday: "Terça-feira",
      profit: 18.92,
    });
  });

  it("lucro do dia soma todos os turnos do dia e aceita prejuízo", async () => {
    const nav = await novaConta();
    await criarTurno(nav, "2020-11-03", "08:00", "10:00", "60", "10");
    await criarTurno(nav, "2020-11-03", "18:00", "20:00", "35", "5");
    await criarTurno(nav, "2020-11-05", "08:00", "09:00", "10", "25.50");
    const d = (await nav.get("/api/dashboard?year=2020&month=11")).corpo;
    expect(d.most_profitable_day).toMatchObject({
      date: "2020-11-03",
      earnings: 95,
      costs: 15,
      profit: 80,
    });
    expect(d.least_profitable_day).toMatchObject({ date: "2020-11-05", profit: -15.5 });
    expect(d.days_worked).toBe(3);
  });

  it("empate: vale o dia mais recente", async () => {
    const nav = await novaConta();
    await criarTurno(nav, "2020-11-10", "08:00", "09:00", "25", "5");
    await criarTurno(nav, "2020-11-12", "08:00", "09:00", "30", "10");
    const d = (await nav.get("/api/dashboard?year=2020&month=11")).corpo;
    expect(d.most_profitable_day.date).toBe("2020-11-12");
    expect(d.least_profitable_day.date).toBe("2020-11-12");
  });

  it("período sem turnos concluídos: zeros e nulos", async () => {
    const nav = await novaConta();
    await nav.post("/api/clock/in"); // turno aberto não entra nas contas
    const [ano, mes] = hojeSP().split("-");
    const d = (await nav.get(`/api/dashboard?year=${ano}&month=${Number(mes)}`)).corpo;
    expect(d).toMatchObject({
      total_earnings: 0,
      total_costs: 0,
      total_profit: 0,
      cost_ratio_percent: null,
      avg_worked_hours: null,
      days_worked: 0,
      most_profitable_day: null,
      least_profitable_day: null,
      daily_earnings: [],
    });
  });
});

describe("semanas reais", () => {
  it("devolve as semanas do mês e filtra por uma delas", async () => {
    const nav = await contaComSetembro();
    const mes = (await nav.get("/api/dashboard?year=2026&month=9")).corpo;
    expect(mes.weeks.map((s: { label: string }) => s.label)).toEqual([
      "30/08 a 05/09",
      "06/09 a 12/09",
      "13/09 a 19/09",
      "20/09 a 26/09",
      "27/09 a 03/10",
    ]);

    const semana = (await nav.get("/api/dashboard?year=2026&month=9&week=3")).corpo;
    expect(semana.week).toBe(3);
    expect(semana.period).toEqual({ from: "2026-09-13", to: "2026-09-19" });
    expect(semana.days_worked).toBe(6);
    expect(semana.total_earnings).toBe(247.68);
  });

  it("semana que cruza o mês inclui os dias do mês vizinho; o mês inteiro, não", async () => {
    const nav = await novaConta();
    await criarTurno(nav, "2026-09-28", "10:00", "12:00", "40", "5");
    await criarTurno(nav, "2026-10-02", "10:00", "13:00", "60", "10");

    const semana = (await nav.get("/api/dashboard?year=2026&month=10&week=1")).corpo;
    expect(semana.period).toEqual({ from: "2026-09-27", to: "2026-10-03" });
    expect(semana.total_earnings).toBe(100);
    expect(semana.daily_earnings.map((d: { date_label: string }) => d.date_label)).toEqual([
      "28/09",
      "02/10",
    ]);

    expect((await nav.get("/api/dashboard?year=2026&month=10")).corpo.total_earnings).toBe(60);
  });

  it.each(["0", "6", "abc"])("week=%s inválida para outubro/2026: 400", async (semana) => {
    const nav = await novaConta();
    expect((await nav.get(`/api/dashboard?year=2026&month=10&week=${semana}`)).status).toBe(400);
  });
});

describe("parâmetros", () => {
  it.each([
    ["", "Informe ano e mês válidos."],
    ["?year=2026", "Informe ano e mês válidos."],
    ["?year=2026&month=13", "Mês inválido."],
    ["?year=1999&month=1", "Ano inválido."],
    ["?year=abc&month=1", "Informe ano e mês válidos."],
  ])("dashboard%s: 400 (%s)", async (consulta, mensagem) => {
    const nav = await novaConta();
    const r = await nav.get(`/api/dashboard${consulta}`);
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe(mensagem);
  });

  it("dashboard exige login", async () => {
    expect((await new Navegador().get("/api/dashboard?year=2026&month=9")).status).toBe(401);
    expect((await new Navegador().get("/api/dashboard/months")).status).toBe(401);
  });
});
