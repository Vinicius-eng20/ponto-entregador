// Login e cadastro: envia o formulário para a API e entra no painel.
document.addEventListener("DOMContentLoaded", () => {
  const formulario = document.querySelector("form[data-acesso]");
  if (!formulario) return;

  const erro = formulario.querySelector(".erro-formulario");
  const botao = formulario.querySelector("button[type=submit]");
  const textoBotao = botao.textContent;
  const rota = formulario.dataset.acesso === "cadastro" ? "/api/auth/register" : "/api/auth/login";

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erro.textContent = "";
    botao.disabled = true;
    botao.textContent =
      formulario.dataset.acesso === "cadastro" ? "Criando conta..." : "Entrando...";

    const dados = Object.fromEntries(new FormData(formulario));
    try {
      await apiFetch(rota, { method: "POST", body: dados });
      window.location.href = "/app";
    } catch (e) {
      erro.textContent = e.message;
      botao.disabled = false;
      botao.textContent = textoBotao;
      formulario.querySelector("input[name=password]")?.select();
    }
  });
});
