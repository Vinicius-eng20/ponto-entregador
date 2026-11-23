// Dashboard: filtros de mês e semana, indicadores e gráfico de ganhos por dia.
// Expõe window.Dashboard para o painel recarregar após mudanças nos registros.
(() => {
  const selMes = document.getElementById("filtro-mes");
  const selSemana = document.getElementById("filtro-semana");
  const el = (id) => document.getElementById(id);
  let grafico = null;
  // Mês cujas semanas estão no seletor; evita recriá-lo a cada atualização.
  let mesDasSemanas = null;

  /** Preenche o seletor com as semanas reais (domingo a sábado) que a API devolve. */
  function preencherSemanas(semanas) {
    const escolhida = selSemana.value;
    selSemana.innerHTML = '<option value="">Mês inteiro</option>';
    for (const s of semanas) selSemana.add(new Option(s.label, String(s.week)));
    selSemana.value = semanas.some((s) => String(s.week) === escolhida) ? escolhida : "";
    selSemana.disabled = false;
    mesDasSemanas = selMes.value;
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
          tooltip: {
            callbacks: {
              label: (ctx) => `Ganhos: ${Formato.moeda(ctx.parsed.y)}`,
              afterLabel: (ctx) => `Lucro: ${Formato.moeda(dias[ctx.dataIndex].profit)}`,
            },
          },
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

  function mostrarDia(idValor, idData, dia) {
    el(idValor).textContent = dia ? Formato.moeda(dia.profit) : "—";
    el(idData).textContent = dia ? `${dia.weekday}, ${dia.date_label}` : "";
  }

  async function atualizar() {
    if (!selMes.value) return;
    const [ano, mes] = selMes.value.split("-");
    const parametros = new URLSearchParams({ year: ano, month: mes });
    // As semanas são do mês: ao trocar de mês, a semana escolhida não vale mais.
    if (selSemana.value && mesDasSemanas === selMes.value) parametros.set("week", selSemana.value);

    try {
      const d = await apiFetch(`/api/dashboard?${parametros}`);
      if (mesDasSemanas !== selMes.value) {
        selSemana.value = "";
        preencherSemanas(d.weeks);
      }

      el("kpi-faturamento").textContent = Formato.moeda(d.total_earnings);
      el("kpi-custos").textContent = Formato.moeda(d.total_costs);
      el("kpi-percentual").textContent =
        d.cost_ratio_percent === null
          ? ""
          : `${String(d.cost_ratio_percent).replace(".", ",")}% do faturamento`;
      el("kpi-lucro").textContent = Formato.moeda(d.total_profit);
      el("kpi-horas").textContent = d.avg_worked_hours ?? "—";
      el("kpi-turnos").textContent =
        d.days_worked === 1 ? "1 turno no período" : `${d.days_worked} turnos no período`;
      mostrarDia("kpi-melhor-dia", "kpi-melhor-dia-data", d.most_profitable_day);
      mostrarDia("kpi-pior-dia", "kpi-pior-dia-data", d.least_profitable_day);
      desenharGrafico(d.daily_earnings);
    } catch (e) {
      mostrarAviso(e.message, "erro");
    }
  }

  async function iniciar() {
    try {
      const meses = await apiFetch("/api/dashboard/months");
      for (const m of meses) selMes.add(new Option(m.label, `${m.year}-${m.month}`));

      // Abre sempre no mês atual (a API sempre inclui o mês atual na lista).
      const [anoAtual, mesAtual] = Formato.agora().data.split("-").map(Number);
      selMes.value = `${anoAtual}-${mesAtual}`;
      await atualizar();
    } catch (e) {
      mostrarAviso(e.message, "erro");
    }
  }

  selMes.addEventListener("change", atualizar);
  selSemana.addEventListener("change", atualizar);

  window.Dashboard = { iniciar, atualizar };
})();
