import { beforeEach, describe, expect, it } from "vitest";

import { criarTurno, limparBanco, Navegador, novaConta } from "../helpers";

beforeEach(limparBanco);

describe("isolamento entre contas", () => {
  it("uma conta não vê, edita nem exclui os registros de outra", async () => {
    const a = await novaConta("A");
    const b = await novaConta("B");
    const turno = await criarTurno(a, "2026-09-10", "09:00", "13:00", 50, 10);

    expect((await b.get("/api/records")).corpo.items).toEqual([]);
    expect(
      (
        await b.put(`/api/records/${turno.id}`, {
          date: "2026-09-10",
          start_time: "09:00",
          end_time: "13:00",
          earnings: 1,
          costs: 1,
        })
      ).status,
    ).toBe(404);
    expect((await b.delete(`/api/records/${turno.id}`)).status).toBe(404);
    expect((await b.get("/api/dashboard?year=2026&month=9")).corpo.total_earnings).toBe(0);

    const deA = (await a.get("/api/records")).corpo;
    expect(deA.total).toBe(1);
    expect(deA.items[0].earnings).toBe(50);
  });

  it("o ponto de uma conta é independente do da outra", async () => {
    const a = await novaConta("A");
    const b = await novaConta("B");
    await a.post("/api/clock/in");
    expect((await b.get("/api/clock/status")).corpo.state).toBe("idle");
    expect((await b.post("/api/clock/in")).status).toBe(201);
  });
});

describe("CSRF", () => {
  it("formulário enviado de outro site é barrado com 403", async () => {
    const nav = await novaConta();
    const r = await nav.req("POST", "/api/clock/in", {
      headers: {
        origin: "https://site-malicioso.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      corpo: "x=1",
    });
    expect(r.status).toBe(403);
    expect(r.corpo.error).toBe("forbidden");
    expect((await nav.get("/api/clock/status")).corpo.state).toBe("idle");
  });

  it("a mesma chamada vinda do próprio app passa", async () => {
    const nav = await novaConta();
    expect((await nav.post("/api/clock/in")).status).toBe(201);
  });
});

describe("respostas de erro e saúde", () => {
  it("/health confere o banco", async () => {
    const r = await new Navegador().get("/health");
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ status: "ok", banco: "ok" });
  });

  it("rota de API inexistente: 404 em JSON", async () => {
    const r = await (await novaConta()).get("/api/nao-existe");
    expect(r.status).toBe(404);
    expect(r.corpo).toEqual({ error: "not_found", message: "Recurso não encontrado." });
  });

  it("cabeçalhos de segurança nas respostas do Worker", async () => {
    const r = await new Navegador().get("/health");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
