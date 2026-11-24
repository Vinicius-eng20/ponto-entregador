import { beforeEach, describe, expect, it } from "vitest";

import { criarTurno, limparBanco, Navegador, novaConta } from "../helpers";

beforeEach(limparBanco);

const TURNO = {
  date: "2026-09-10",
  start_time: "09:00",
  end_time: "13:00",
  earnings: "50.00",
  costs: "10.00",
};

describe("criar turno manual", () => {
  it("calcula dia da semana e horas trabalhadas", async () => {
    const nav = await novaConta();
    const r = await nav.post("/api/records", TURNO);
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      date: "2026-09-10",
      weekday: "Quinta-feira",
      start_time: "09:00",
      end_time: "13:00",
      earnings: 50,
      costs: 10,
      worked_hours: "04:00",
    });
  });

  it("turno que passa da meia-noite", async () => {
    const nav = await novaConta();
    const r = await criarTurno(nav, "2026-09-12", "22:30", "01:15", 30, 0);
    expect(r.worked_hours).toBe("02:45");
  });

  it.each([
    [{ earnings: "" }, "Campos obrigatórios ausentes: earnings."],
    [{ date: undefined, costs: undefined }, "Campos obrigatórios ausentes: date, costs."],
    [{ date: "10/09/2026" }, "Data inválida. Use o formato AAAA-MM-DD."],
    [{ date: "2026-02-30" }, "Data inválida. Use o formato AAAA-MM-DD."],
    [{ start_time: "25:00" }, "Horário inválido. Use o formato HH:MM."],
    [{ earnings: "-1" }, "O campo 'ganhos' não pode ser negativo."],
  ])("recusa %j", async (troca, mensagem) => {
    const nav = await novaConta();
    const r = await nav.post("/api/records", { ...TURNO, ...troca });
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe(mensagem);
  });

  it("corpo que não é JSON vale como vazio", async () => {
    const nav = await novaConta();
    const r = await nav.req("POST", "/api/records", {
      corpo: "isto não é json",
      headers: { "content-type": "application/json" },
    });
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe(
      "Campos obrigatórios ausentes: date, start_time, end_time, earnings, costs.",
    );
  });
});

describe("editar e excluir", () => {
  it("edita todos os campos e recalcula as horas", async () => {
    const nav = await novaConta();
    const criado = await criarTurno(nav, "2026-09-10", "09:00", "13:00", 50, 10);
    const r = await nav.put(`/api/records/${criado.id}`, {
      ...TURNO,
      end_time: "14:30",
      earnings: "99",
    });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ id: criado.id, earnings: 99, worked_hours: "05:30" });
  });

  it("edição valida os campos como na criação", async () => {
    const nav = await novaConta();
    const criado = await criarTurno(nav, "2026-09-10", "09:00", "13:00", 50, 10);
    const r = await nav.put(`/api/records/${criado.id}`, { ...TURNO, costs: "x" });
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe("O campo 'custos' deve ser um número válido.");
  });

  it("exclui e o registro some da lista", async () => {
    const nav = await novaConta();
    const criado = await criarTurno(nav, "2026-09-10", "09:00", "13:00", 50, 10);
    expect((await nav.delete(`/api/records/${criado.id}`)).status).toBe(204);
    expect((await nav.get("/api/records")).corpo.total).toBe(0);
  });

  it.each(["/api/records/999999", "/api/records/abc", "/api/records/0"])(
    "registro inexistente em %s: 404",
    async (caminho) => {
      const nav = await novaConta();
      expect((await nav.put(caminho, TURNO)).status).toBe(404);
      expect((await nav.delete(caminho)).status).toBe(404);
    },
  );
});

describe("listagem paginada", () => {
  it("sem registros: página 1 vazia", async () => {
    const nav = await novaConta();
    expect((await nav.get("/api/records")).corpo).toEqual({
      items: [],
      page: 1,
      per_page: 10,
      total: 0,
      total_pages: 1,
    });
  });

  it("10 por página, mais recentes primeiro, sem repetir entre páginas", async () => {
    const nav = await novaConta();
    for (let dia = 1; dia <= 21; dia++) {
      await criarTurno(nav, `2026-08-${String(dia).padStart(2, "0")}`, "10:00", "12:00", 10, 1);
    }
    // Mesmo dia e horário: o desempate é pelo id, do maior para o menor.
    const empate1 = await criarTurno(nav, "2026-08-21", "10:00", "12:00", 10, 1);
    const empate2 = await criarTurno(nav, "2026-08-21", "10:00", "12:00", 10, 1);
    // Mesmo dia, entrada mais tarde: vem antes.
    const noite = await criarTurno(nav, "2026-08-21", "19:00", "22:00", 10, 1);

    const p1 = (await nav.get("/api/records")).corpo;
    expect(p1).toMatchObject({ page: 1, per_page: 10, total: 24, total_pages: 3 });
    expect(p1.items).toHaveLength(10);
    expect(p1.items.slice(0, 3).map((r: { id: number }) => r.id)).toEqual([
      noite.id,
      empate2.id,
      empate1.id,
    ]);

    const p3 = (await nav.get("/api/records?page=3")).corpo;
    expect(p3.items.map((r: { date: string }) => r.date)).toEqual([
      "2026-08-04",
      "2026-08-03",
      "2026-08-02",
      "2026-08-01",
    ]);

    const todos = [];
    for (const pagina of [1, 2, 3])
      todos.push(...(await nav.get(`/api/records?page=${pagina}`)).corpo.items);
    expect(new Set(todos.map((r) => r.id)).size).toBe(24);
    const ordem = todos.map((r) => `${r.date} ${r.start_time} ${String(r.id).padStart(6, "0")}`);
    expect(ordem).toEqual([...ordem].sort().reverse());
  });

  it("página além da última: items vazio com os totais", async () => {
    const nav = await novaConta();
    await criarTurno(nav, "2026-08-01", "10:00", "12:00", 10, 1);
    expect((await nav.get("/api/records?page=5")).corpo).toEqual({
      items: [],
      page: 5,
      per_page: 10,
      total: 1,
      total_pages: 1,
    });
  });

  it.each(["0", "-1", "abc", "1.5", ""])("page=%j é inválido: 400", async (pagina) => {
    const nav = await novaConta();
    const r = await nav.get(`/api/records?page=${pagina}`);
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe("Página inválida. Use um número a partir de 1.");
  });

  it("listagem exige login", async () => {
    expect((await new Navegador().get("/api/records")).status).toBe(401);
  });
});
