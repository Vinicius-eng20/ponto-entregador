import { beforeEach, describe, expect, it } from "vitest";

import { hojeSP, limparBanco, Navegador, novaConta, sql } from "../helpers";

beforeEach(limparBanco);

describe("ciclo do ponto", () => {
  it("API do ponto exige login", async () => {
    const r = await new Navegador().get("/api/clock/status");
    expect(r.status).toBe(401);
    expect(r.corpo).toEqual({
      error: "unauthorized",
      message: "Sessão expirada. Faça login novamente.",
    });
  });

  it("idle → working → awaiting_totals → idle", async () => {
    const nav = await novaConta();
    expect((await nav.get("/api/clock/status")).corpo).toEqual({ state: "idle", record: null });

    const entrada = await nav.post("/api/clock/in");
    expect(entrada.status).toBe(201);
    expect(entrada.corpo).toMatchObject({ date: hojeSP(), end_time: null, earnings: null });
    expect(entrada.corpo.start_time).toMatch(/^\d{2}:\d{2}$/);

    const trabalhando = (await nav.get("/api/clock/status")).corpo;
    expect(trabalhando.state).toBe("working");
    expect(trabalhando.record.id).toBe(entrada.corpo.id);

    const saida = await nav.post("/api/clock/out");
    expect(saida.status).toBe(200);
    expect(saida.corpo.end_time).toMatch(/^\d{2}:\d{2}$/);
    expect((await nav.get("/api/clock/status")).corpo.state).toBe("awaiting_totals");

    const fechar = await nav.post("/api/clock/close", { earnings: "45,90", costs: 8.5 });
    expect(fechar.status).toBe(200);
    expect(fechar.corpo).toMatchObject({ earnings: 45.9, costs: 8.5, worked_hours: "00:00" });
    expect((await nav.get("/api/clock/status")).corpo).toEqual({ state: "idle", record: null });
  });

  it("segunda entrada com turno aberto: 409", async () => {
    const nav = await novaConta();
    await nav.post("/api/clock/in");
    const r = await nav.post("/api/clock/in");
    expect(r.status).toBe(409);
    expect(r.corpo.error).toBe("invalid_state");
    expect(await sql("SELECT 1 FROM work_records")).toHaveLength(1);
  });

  it("entrada com turno aguardando ganhos e custos: 409", async () => {
    const nav = await novaConta();
    await nav.post("/api/clock/in");
    await nav.post("/api/clock/out");
    const r = await nav.post("/api/clock/in");
    expect(r.status).toBe(409);
    expect(r.corpo.message).toContain("aguardando ganhos e custos");
  });

  it("o banco garante um único turno aberto, mesmo sem passar pela API", async () => {
    const nav = await novaConta();
    await nav.post("/api/clock/in");
    await expect(
      sql("INSERT INTO work_records (user_id, date, start_time) VALUES (1, '2026-01-01', '10:00')"),
    ).rejects.toThrow(/ux_open_shift_per_user/);
  });

  it("saída sem entrada: 409", async () => {
    const nav = await novaConta();
    expect((await nav.post("/api/clock/out")).status).toBe(409);
  });

  it("fechar sem ter saído: 400", async () => {
    const nav = await novaConta();
    await nav.post("/api/clock/in");
    const r = await nav.post("/api/clock/close", { earnings: 10, costs: 1 });
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe("Não há turno aguardando ganhos e custos.");
  });

  it.each([
    [{ earnings: "abc", costs: 1 }, "O campo 'ganhos' deve ser um número válido."],
    [{ earnings: 10, costs: "-1" }, "O campo 'custos' não pode ser negativo."],
    [{ costs: 1 }, "O campo 'ganhos' deve ser um número válido."],
  ])("fechar com %j: 400 (%s) e o turno continua aguardando", async (corpo, mensagem) => {
    const nav = await novaConta();
    await nav.post("/api/clock/in");
    await nav.post("/api/clock/out");
    const r = await nav.post("/api/clock/close", corpo);
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe(mensagem);
    expect((await nav.get("/api/clock/status")).corpo.state).toBe("awaiting_totals");
  });
});
