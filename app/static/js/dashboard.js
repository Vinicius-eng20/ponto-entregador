document.addEventListener("DOMContentLoaded", () => {
  const mesSelect = document.getElementById("dash-mes");
  const semanaSelect = document.getElementById("dash-semana");
  const vazio = document.getElementById("dash-vazio");
  const conteudo = document.getElementById("dash-conteudo");

  const elFaturamento = document.getElementById("dash-faturamento");
  const elCustos = document.getElementById("dash-custos");
  const elMediaHoras = document.getElementById("dash-media-horas");
  const elPercentual = document.getElementById("dash-percentual-custos");

  let chart = null;

  function formatarMoeda(valor) {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function diasNoMes(year, month) {
    // dia 0 do mês seguinte = último dia do mês atual
    return new Date(year, month, 0).getDate();
  }

  function preencherSemanas(year, month) {
    semanaSelect.innerHTML = '<option value="">Mês inteiro</option>';

    const totalDias = diasNoMes(year, month);
    const totalSemanas = Math.ceil(totalDias / 7);

    for (let semana = 1; semana <= totalSemanas; semana++) {
      const inicio = (semana - 1) * 7 + 1;
      const fim = Math.min(inicio + 6, totalDias);

      const option = document.createElement("option");
      option.value = String(semana);
      option.textContent = `Semana ${semana} (${String(inicio).padStart(2, "0")}–${String(fim).padStart(2, "0")})`;
      semanaSelect.appendChild(option);
    }

    semanaSelect.disabled = false;
    semanaSelect.value = "";
  }

  async function carregarMeses() {
    try {
      const meses = await apiFetch("/api/dashboard/months");
      meses.forEach((m) => {
        const option = document.createElement("option");
        option.value = `${m.year}-${m.month}`;
        option.textContent = m.label;
        mesSelect.appendChild(option);
      });
    } catch (err) {
      console.error("Não foi possível carregar os meses disponíveis:", err);
    }
  }

  function renderizarGrafico(dailyEarnings) {
    const ctx = document.getElementById("dash-grafico-ganhos");
    const labels = dailyEarnings.map((d) => d.date_label);
    const valores = dailyEarnings.map((d) => d.earnings);

    if (chart) {
      chart.destroy();
    }

    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Ganhos (R$)",
            data: valores,
            backgroundColor: "#0d6efd",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  async function atualizarDashboard() {
    const mesValue = mesSelect.value;

    if (!mesValue) {
      vazio.classList.remove("d-none");
      conteudo.classList.add("d-none");
      return;
    }

    const [year, month] = mesValue.split("-");
    const semana = semanaSelect.value;

    const params = new URLSearchParams({ year, month });
    if (semana) params.set("week", semana);

    try {
      const dados = await apiFetch(`/api/dashboard?${params.toString()}`);

      vazio.classList.add("d-none");
      conteudo.classList.remove("d-none");

      elFaturamento.textContent = formatarMoeda(dados.total_earnings);
      elCustos.textContent = formatarMoeda(dados.total_costs);
      elMediaHoras.textContent = dados.avg_worked_hours || "—";
      elPercentual.textContent =
        dados.cost_ratio_percent !== null ? `${dados.cost_ratio_percent}%` : "—";

      renderizarGrafico(dados.daily_earnings);
    } catch (err) {
      alert(err.message);
    }
  }

  mesSelect.addEventListener("change", () => {
    if (!mesSelect.value) {
      semanaSelect.disabled = true;
      semanaSelect.innerHTML = '<option value="">Mês inteiro</option>';
      atualizarDashboard();
      return;
    }

    const [year, month] = mesSelect.value.split("-").map(Number);
    preencherSemanas(year, month);
    atualizarDashboard();
  });

  semanaSelect.addEventListener("change", atualizarDashboard);

  carregarMeses();
});
