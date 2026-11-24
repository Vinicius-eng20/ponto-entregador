// Painel: relógio, ciclo do ponto, tabela de registros e modais.
(() => {
  const el = (id) => document.getElementById(id);
  const cartaoPonto = el("ponto");
  const botaoPonto = el("botao-ponto");
  const formTotais = el("form-totais");
  let estadoAtual = null;
  let registroAtual = null;
  let registros = [];

  // ---- Relógio e data (São Paulo) ------------------------------------------

  function atualizarRelogio() {
    const agora = Formato.agora();
    el("relogio").innerHTML = `${agora.hora}:${agora.minuto}<span>:${agora.segundo}</span>`;
    el("data-hoje").textContent = Formato.hojePorExtenso();
    if (estadoAtual === "working") descreverEstado();
  }

  // ---- Ponto ---------------------------------------------------------------

  function descreverEstado() {
    const situacao = el("situacao-ponto");
    const icone = botaoPonto.querySelector("i");
    const texto = botaoPonto.querySelector(".botao-ponto-texto");

    if (estadoAtual === "idle") {
      situacao.textContent = "Nenhum turno em andamento.";
      icone.className = "bi bi-play-fill";
      texto.textContent = "Registrar entrada";
    } else if (estadoAtual === "working") {
      const minutos = Formato.minutosDesde(registroAtual.date, registroAtual.start_time);
      situacao.innerHTML = `Turno iniciado às <strong>${registroAtual.start_time}</strong>, há ${Formato.duracao(minutos)}.`;
      icone.className = "bi bi-stop-fill";
      texto.textContent = "Registrar saída";
    } else if (estadoAtual === "awaiting_totals") {
      situacao.innerHTML = `Turno das <strong>${registroAtual.start_time}</strong> às <strong>${registroAtual.end_time}</strong> encerrado. Informe quanto ganhou e gastou.`;
    }
  }

  function aplicarStatus({ state, record }) {
    estadoAtual = state;
    registroAtual = record;
    cartaoPonto.dataset.estado = state;
    formTotais.hidden = state !== "awaiting_totals";
    botaoPonto.disabled = false;
    descreverEstado();
    if (state === "awaiting_totals") el("totais-ganhos").focus();
  }

  async function carregarStatus() {
    aplicarStatus(await apiFetch("/api/clock/status"));
  }

  botaoPonto.addEventListener("click", async () => {
    botaoPonto.disabled = true;
    try {
      if (estadoAtual === "idle") {
        const r = await apiFetch("/api/clock/in", { method: "POST" });
        mostrarAviso(`Entrada registrada às ${r.start_time}.`);
        paginaAtual = 1;
      } else if (estadoAtual === "working") {
        const r = await apiFetch("/api/clock/out", { method: "POST" });
        mostrarAviso(`Saída registrada às ${r.end_time}.`);
      }
      await Promise.all([carregarStatus(), carregarRegistros()]);
    } catch (e) {
      mostrarAviso(e.message, "erro");
      await carregarStatus().catch(() => undefined);
    }
  });

  formTotais.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const botao = formTotais.querySelector("button");
    botao.disabled = true;
    try {
      await apiFetch("/api/clock/close", {
        method: "POST",
        body: { earnings: el("totais-ganhos").value, costs: el("totais-custos").value },
      });
      formTotais.reset();
      mostrarAviso("Turno salvo.");
      await Promise.all([carregarStatus(), carregarRegistros(), Dashboard.atualizar()]);
    } catch (e) {
      mostrarAviso(e.message, "erro");
    } finally {
      botao.disabled = false;
    }
  });

  // ---- Registros -----------------------------------------------------------

  function celula(texto, classe = "") {
    const td = document.createElement("td");
    if (classe) td.className = classe;
    td.textContent = texto;
    return td;
  }

  function botaoAcao(icone, rotulo, classe, aoClicar) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = classe;
    b.setAttribute("aria-label", rotulo);
    b.title = rotulo;
    b.innerHTML = `<i class="bi ${icone}" aria-hidden="true"></i>`;
    b.addEventListener("click", aoClicar);
    return b;
  }

  function desenharRegistros() {
    const corpo = el("corpo-registros");
    corpo.replaceChildren();
    el("registros-vazio").hidden = registros.length > 0;
    corpo.closest("table").hidden = registros.length === 0;

    for (const r of registros) {
      const tr = document.createElement("tr");
      tr.append(celula(Formato.data(r.date)), celula(r.weekday), celula(r.start_time));

      if (r.end_time) {
        tr.append(celula(r.end_time));
      } else {
        const td = document.createElement("td");
        td.innerHTML = '<span class="em-andamento">Em andamento</span>';
        tr.append(td);
      }

      tr.append(
        celula(r.earnings === null ? "—" : Formato.moeda(r.earnings), `text-end ${r.earnings === null ? "" : "valor-ganho"}`),
        celula(r.costs === null ? "—" : Formato.moeda(r.costs), `text-end ${r.costs === null ? "" : "valor-custo"}`),
        celula(r.worked_hours ?? "—", "text-end"),
      );

      const acoes = document.createElement("td");
      acoes.className = "acoes";
      acoes.append(
        botaoAcao("bi-pencil", `Editar turno de ${Formato.data(r.date)}`, "", () => abrirEdicao(r)),
        botaoAcao("bi-trash3", `Excluir turno de ${Formato.data(r.date)}`, "excluir", () => abrirExclusao(r)),
      );
      tr.append(acoes);
      corpo.append(tr);
    }
  }

  let paginaAtual = 1;

  function desenharPaginacao(pagina) {
    el("paginacao").hidden = pagina.total === 0;
    el("pagina-anterior").disabled = pagina.page <= 1;
    el("pagina-proxima").disabled = pagina.page >= pagina.total_pages;
    const turnos = pagina.total === 1 ? "1 turno" : `${pagina.total} turnos`;
    el("pagina-info").textContent = `Página ${pagina.page} de ${pagina.total_pages}, ${turnos}`;
  }

  /** Carrega uma página da tabela. Sem argumento, recarrega a página atual. */
  async function carregarRegistros(pagina = paginaAtual) {
    let resposta = await apiFetch(`/api/records?page=${pagina}`);
    // Ao excluir o último turno de uma página, volta para a última que existe.
    if (resposta.items.length === 0 && resposta.page > resposta.total_pages) {
      resposta = await apiFetch(`/api/records?page=${resposta.total_pages}`);
    }
    paginaAtual = resposta.page;
    registros = resposta.items;
    desenharRegistros();
    desenharPaginacao(resposta);
  }

  el("pagina-anterior").addEventListener("click", () => mudarPagina(paginaAtual - 1));
  el("pagina-proxima").addEventListener("click", () => mudarPagina(paginaAtual + 1));

  async function mudarPagina(pagina) {
    try {
      await carregarRegistros(pagina);
      el("registros").scrollIntoView({ block: "start" });
    } catch (e) {
      mostrarAviso(e.message, "erro");
    }
  }

  // ---- Modal de adicionar / editar ----------------------------------------

  const modalRegistro = new bootstrap.Modal(el("modal-registro"));
  const formRegistro = el("form-registro");
  const erroRegistro = formRegistro.querySelector(".erro-formulario");

  function abrirAdicao() {
    formRegistro.reset();
    formRegistro.elements.id.value = "";
    formRegistro.elements.date.value = Formato.agora().data;
    el("titulo-modal-registro").textContent = "Adicionar turno";
    el("botao-salvar-registro").textContent = "Adicionar turno";
    erroRegistro.textContent = "";
    modalRegistro.show();
  }

  function abrirEdicao(r) {
    formRegistro.reset();
    const campos = formRegistro.elements;
    campos.id.value = r.id;
    campos.date.value = r.date;
    campos.start_time.value = r.start_time;
    campos.end_time.value = r.end_time ?? "";
    campos.earnings.value = r.earnings ?? "";
    campos.costs.value = r.costs ?? "";
    el("titulo-modal-registro").textContent = "Editar turno";
    el("botao-salvar-registro").textContent = "Salvar alterações";
    erroRegistro.textContent = "";
    modalRegistro.show();
  }

  el("modal-registro").addEventListener("shown.bs.modal", () => formRegistro.elements.date.focus());
  el("botao-adicionar").addEventListener("click", abrirAdicao);

  formRegistro.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erroRegistro.textContent = "";
    const dados = Object.fromEntries(new FormData(formRegistro));
    const id = dados.id;
    delete dados.id;

    const botao = el("botao-salvar-registro");
    botao.disabled = true;
    try {
      if (id) {
        await apiFetch(`/api/records/${id}`, { method: "PUT", body: dados });
        mostrarAviso("Turno atualizado.");
      } else {
        await apiFetch("/api/records", { method: "POST", body: dados });
        mostrarAviso("Turno adicionado.");
        paginaAtual = 1;
      }
      modalRegistro.hide();
      await Promise.all([carregarRegistros(), carregarStatus(), Dashboard.atualizar()]);
    } catch (e) {
      erroRegistro.textContent = e.message;
    } finally {
      botao.disabled = false;
    }
  });

  // ---- Modal de exclusão --------------------------------------------------

  const modalExcluir = new bootstrap.Modal(el("modal-excluir"));
  let paraExcluir = null;

  function abrirExclusao(r) {
    paraExcluir = r;
    el("texto-excluir").textContent =
      `O turno de ${Formato.data(r.date)}, das ${r.start_time}` +
      `${r.end_time ? ` às ${r.end_time}` : ""}, será excluído. Essa ação não pode ser desfeita.`;
    modalExcluir.show();
  }

  el("botao-confirmar-exclusao").addEventListener("click", async () => {
    if (!paraExcluir) return;
    const botao = el("botao-confirmar-exclusao");
    botao.disabled = true;
    try {
      await apiFetch(`/api/records/${paraExcluir.id}`, { method: "DELETE" });
      modalExcluir.hide();
      mostrarAviso("Turno excluído.");
      await Promise.all([carregarRegistros(), carregarStatus(), Dashboard.atualizar()]);
    } catch (e) {
      mostrarAviso(e.message, "erro");
    } finally {
      botao.disabled = false;
      paraExcluir = null;
    }
  });

  // ---- Menu: item ativo conforme a seção visível --------------------------

  const links = [...document.querySelectorAll(".menu-links a")];
  const secoes = ["ponto", "dashboard", "registros"].map(el);

  // Ativo: a última seção cujo topo já passou do primeiro terço da tela.
  // No topo da página é sempre o Ponto; no fim, sempre Registros.
  function marcarSecaoAtiva() {
    let atual = secoes[0];
    for (const secao of secoes) {
      if (secao.getBoundingClientRect().top <= window.innerHeight / 3) atual = secao;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      atual = secoes[secoes.length - 1];
    }
    for (const link of links) {
      link.classList.toggle("ativo", link.getAttribute("href") === `#${atual.id}`);
    }
  }
  window.addEventListener("scroll", marcarSecaoAtiva, { passive: true });
  window.addEventListener("resize", marcarSecaoAtiva);
  marcarSecaoAtiva();

  // ---- Sessão --------------------------------------------------------------

  el("botao-sair").addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  });

  // ---- Início --------------------------------------------------------------

  atualizarRelogio();
  setInterval(atualizarRelogio, 1000);

  (async () => {
    try {
      const { user } = await apiFetch("/api/auth/me");
      el("nome-usuario").textContent = user.name;
      await Promise.all([carregarStatus(), carregarRegistros(), Dashboard.iniciar()]);
    } catch (e) {
      if (/Sessão expirada/.test(e.message)) window.location.href = "/login";
      else mostrarAviso(e.message, "erro");
    }
  })();
})();
