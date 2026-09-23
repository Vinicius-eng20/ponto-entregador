document.addEventListener("DOMContentLoaded", () => {
  const els = {
    idle: document.getElementById("ponto-idle"),
    working: document.getElementById("ponto-working"),
    awaitingTotals: document.getElementById("ponto-awaiting-totals"),
    erro: document.getElementById("ponto-erro"),
    btnEntrada: document.getElementById("btn-entrada"),
    btnSaida: document.getElementById("btn-saida"),
    formTotais: document.getElementById("form-totais"),
    horaEntrada: document.getElementById("ponto-hora-entrada"),
    horaEntrada2: document.getElementById("ponto-hora-entrada-2"),
    horaSaida: document.getElementById("ponto-hora-saida"),
  };

  function esconderTudo() {
    els.idle.classList.add("d-none");
    els.working.classList.add("d-none");
    els.awaitingTotals.classList.add("d-none");
    els.erro.classList.add("d-none");
  }

  function mostrarErro(mensagem) {
    els.erro.textContent = mensagem;
    els.erro.classList.remove("d-none");
  }

  function render(status) {
    esconderTudo();
    const record = status.record;

    if (status.state === "working") {
      els.horaEntrada.textContent = record.start_time;
      els.working.classList.remove("d-none");
    } else if (status.state === "awaiting_totals") {
      els.horaEntrada2.textContent = record.start_time;
      els.horaSaida.textContent = record.end_time;
      els.awaitingTotals.classList.remove("d-none");
    } else {
      els.idle.classList.remove("d-none");
    }
  }

  async function carregarStatus() {
    const status = await apiFetch("/api/clock/status");
    render(status);
  }

  els.btnEntrada.addEventListener("click", async () => {
    try {
      await apiFetch("/api/clock/in", { method: "POST" });
      await carregarStatus();
    } catch (err) {
      mostrarErro(err.message);
    }
  });

  els.btnSaida.addEventListener("click", async () => {
    try {
      await apiFetch("/api/clock/out", { method: "POST" });
      await carregarStatus();
    } catch (err) {
      mostrarErro(err.message);
    }
  });

  els.formTotais.addEventListener("submit", async (event) => {
    event.preventDefault();
    const earnings = document.getElementById("totais-ganhos").value;
    const costs = document.getElementById("totais-custos").value;

    try {
      await apiFetch("/api/clock/close", {
        method: "POST",
        body: JSON.stringify({ earnings, costs }),
      });
      // Recarrega a página para já refletir a nova linha na tabela de registros.
      window.location.reload();
    } catch (err) {
      mostrarErro(err.message);
    }
  });

  // Formulário do botão (+): adicionar registro manual de outra data
  const formAddRecord = document.getElementById("form-add-record");
  const addRecordErro = document.getElementById("add-record-erro");

  formAddRecord.addEventListener("submit", async (event) => {
    event.preventDefault();
    addRecordErro.classList.add("d-none");

    const payload = {
      date: document.getElementById("add-date").value,
      start_time: document.getElementById("add-start").value,
      end_time: document.getElementById("add-end").value,
      earnings: document.getElementById("add-earnings").value,
      costs: document.getElementById("add-costs").value,
    };

    try {
      await apiFetch("/api/records", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      window.location.reload();
    } catch (err) {
      addRecordErro.textContent = err.message;
      addRecordErro.classList.remove("d-none");
    }
  });

  // Exclusão de registros na tabela
  document.querySelectorAll(".btn-excluir-registro").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este registro?")) return;

      try {
        await apiFetch(`/api/records/${btn.dataset.id}`, { method: "DELETE" });
        window.location.reload();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  // Usa o estado já renderizado pelo servidor (evita uma chamada extra ao carregar a página)
  render(window.PONTO_INITIAL_STATUS);
});
