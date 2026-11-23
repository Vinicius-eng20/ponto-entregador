/**
 * Chamada à API do Worker. Envia e recebe JSON; em 401 (sessão expirada)
 * leva ao login; em erro, lança Error com a mensagem da API.
 */
async function apiFetch(url, { method = "GET", body } = {}) {
  const opcoes = { method, headers: { accept: "application/json" } };
  if (body !== undefined) {
    opcoes.headers["content-type"] = "application/json";
    opcoes.body = JSON.stringify(body);
  }

  let resposta;
  try {
    resposta = await fetch(url, opcoes);
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
  }

  if (resposta.status === 401 && !url.startsWith("/api/auth/")) {
    window.location.href = "/login";
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (resposta.status === 204) return null;

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(dados?.message || "Algo deu errado. Tente de novo.");
  }
  return dados;
}

/** Mensagem curta no canto da tela. tipo: "sucesso" | "erro". */
function mostrarAviso(texto, tipo = "sucesso") {
  let area = document.querySelector(".avisos");
  if (!area) {
    area = document.createElement("div");
    area.className = "avisos";
    area.setAttribute("role", "status");
    area.setAttribute("aria-live", "polite");
    document.body.appendChild(area);
  }
  const aviso = document.createElement("div");
  aviso.className = `aviso ${tipo === "erro" ? "erro" : ""}`;
  aviso.textContent = texto;
  area.appendChild(aviso);
  setTimeout(() => aviso.remove(), tipo === "erro" ? 6000 : 3500);
}
