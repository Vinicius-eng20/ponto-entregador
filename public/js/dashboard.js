// Dashboard: filtros de mês e semana, indicadores e gráfico de ganhos por dia.
// Expõe window.Dashboard.atualizar() para o painel recarregar após mudanças.
(() => {
  const selMes = document.getElementById("filtro-mes");
  const selSemana = document.getElementById("filtro-semana");
  const el = (id) => document.getElementById(id);
  let grafico = null;

  function semanasDoMes(ano, mes) {
    // Etapa 1: mesmos blocos de 7 dias do app Flask (1–7, 8–14, ...).
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const semanas = [];
    for (let s = 1; (s - 1) * 7 + 1 <= ultimoDia; s++) {
      const inicio = (s - 1) * 7 + 1;
      const fim = Math.min(inicio + 6, ultimoDia);
      const mm = String(mes).padStart(2, "0");
      semanas.push({ valor: s, texto: `${String(inicio).padStart(2, "0")}/${mm} a ${String(fim).padStart(2, "0")}/${mm}` });
    }
    return semanas;
  }

  function preencherSemanas() {
    selSemana.innerHTML = '<option value="">Mês inteiro</option>';
    if (!selMes.value) {
      selSemana.disabled = true;
      return;
    }
    const [ano, mes] = selMes.value.split("-").map(Number);
    for (const s of semanasDoMes(ano, mes)) {
      selSemana.add(new Option(s.texto, s.valor));
    }
    selSemana.disabled = false;
  }

  function desenharGrafico(dias) {
    const vazio = dias.length === 0;
    el("grafico-vazio").hidden = !vazio;
    el("grafico-ganhos").hidden = vazio;
    if (grafico) {
      grafico.destroy();
      grafico = null;
    }
    if (vazio) return;

    grafico = new Chart(el("grafico-ganhos"), {
      type: "bar",
      data: {
        labels: dias.map((d) => d.date_label),
        datasets: [
          {
            label: "Ganhos",
            data: dias.map((d) => d.earnings),
            backgroundColor: "#1e8e5a",
            hoverBackgroundColor: "#16704a",
            borderRadius: 4,
            maxBarThickness: 44,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => Formato.moeda(ctx.parsed.y) } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: "Barlow" } } },
          y: {
            beginAtZero: true,
            grid: { color: "#e6eae8" },
            ticks: { font: { family: "Barlow" }, callback: (v) => `R$ ${v}` },
          },
        },
      },
    });
  }

  async function atualizar() {
    if (!selMes.value) return;
    const [ano, mes] = selMes.value.split("-");
    const parametros = new URLSearchParams({ year: ano, month: mes });
    if (selSemana.value) parametros.set("week", selSemana.value);

    try {
      const d = await apiFetch(`/api/dashboard?${parametros}`);
      el("kpi-faturamento").textContent = Formato.moeda(d.total_earnings);
      el("kpi-custos").textContent = Formato.moeda(d.total_costs);
      el("kpi-percentual").textContent =
        d.cost_ratio_percent === null
          ? ""
          : `${String(d.cost_ratio_percent).replace(".", ",")}% do faturamento`;
      el("kpi-lucro").textContent = Formato.moeda(d.total_earnings - d.total_costs);
      el("kpi-horas").textContent = d.avg_worked_hours ?? "—";
      el("kpi-turnos").textContent =
        d.days_worked === 1 ? "1 turno no período" : `${d.days_worked} turnos no período`;
      desenharGrafico(d.daily_earnings);
    } catch (e) {
      mostrarAviso(e.message, "erro");
    }
  }

  async function iniciar() {
    try {
      const meses = await apiFetch("/api/dashboard/months");
      for (const m of meses) selMes.add(new Option(m.label, `${m.year}-${m.month}`));
      preencherSemanas();
      await atualizar();
    } catch (e) {
      mostrarAviso(e.message, "erro");
    }
  }

  selMes.addEventListener("change", () => {
    preencherSemanas();
    atualizar();
  });
  selSemana.addEventListener("change", atualizar);

  window.Dashboard = { iniciar, atualizar };
})();
