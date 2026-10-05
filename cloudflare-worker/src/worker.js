/**
 * Cloudflare Worker que fica na frente do Ponto do Entregador.
 *
 * Toda requisição feita na URL do Worker passa por aqui antes de chegar no
 * Render:
 *   1. Verifica se o backend está acordado (GET /health com timeout curto).
 *   2. Acordado   -> repassa a requisição original para o backend (proxy
 *                    transparente: método, headers, corpo, path e query).
 *   3. Dormindo   -> responde na hora com uma página de loading própria
 *                    (navegação) ou um 503 em JSON (chamadas de API). A
 *                    própria checagem do /health já serve para acordar o
 *                    serviço no Render.
 *
 * A tela de "SERVICE WAKING UP" do Render nunca chega ao navegador porque a
 * decisão acontece aqui, antes da requisição do usuário ir para o Render.
 *
 * Detalhe importante: durante o cold start o Render pode responder o próprio
 * /health com a página HTML dele (status 200). Por isso não basta olhar o
 * status: só consideramos "acordado" se o corpo for exatamente o JSON
 * {"status": "ok"} que a aplicação Flask devolve.
 */

const TIMEOUT_VERIFICACAO_MS = 4000;

// O Render só hiberna após 15 minutos sem tráfego. Se o backend respondeu há
// menos de 60s, ele com certeza continua de pé — então pulamos a checagem e
// evitamos uma ida extra ao Render a cada CSS/JS/chamada de API.
const CACHE_ACORDADO_MS = 60_000;
let ultimoAcordadoEm = 0;

export async function backendEstaAcordado(backendUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_VERIFICACAO_MS);

  try {
    const resposta = await fetch(`${backendUrl}/health`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!resposta.ok) return false;

    const dados = await resposta.json().catch(() => null);
    return Boolean(dados && dados.status === "ok");
  } catch {
    // Timeout, conexão recusada, DNS, corpo que não é JSON... tudo conta como
    // "ainda não está pronto".
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function acordadoComCache(backendUrl) {
  if (Date.now() - ultimoAcordadoEm < CACHE_ACORDADO_MS) return true;

  const acordado = await backendEstaAcordado(backendUrl);
  if (acordado) ultimoAcordadoEm = Date.now();
  return acordado;
}

async function repassarParaBackend(request, backendUrl) {
  const urlOriginal = new URL(request.url);
  const urlDestino = new URL(urlOriginal.pathname + urlOriginal.search, backendUrl);

  const temCorpo = !["GET", "HEAD"].includes(request.method);
  const resposta = await fetch(urlDestino, {
    method: request.method,
    headers: request.headers,
    body: temCorpo ? request.body : undefined,
    // Redirecionamentos (ex.: login -> home) precisam chegar ao navegador,
    // não ser seguidos aqui dentro.
    redirect: "manual",
    ...(temCorpo ? { duplex: "half" } : {}),
  });

  // Se o backend mandar um redirect absoluto apontando para o domínio do
  // Render, reescreve para o domínio do Worker, para o usuário nunca sair dele.
  const location = resposta.headers.get("location");
  const origemBackend = new URL(backendUrl).origin;
  if (location && location.startsWith(origemBackend)) {
    const headers = new Headers(resposta.headers);
    headers.set("location", urlOriginal.origin + location.slice(origemBackend.length));
    return new Response(resposta.body, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers,
    });
  }

  return resposta;
}

function querPagina(request) {
  const accept = request.headers.get("accept") || "";
  return request.method === "GET" && accept.includes("text/html");
}

function respostaDormindo(request) {
  const headers = { "cache-control": "no-store", "retry-after": "5" };

  if (querPagina(request)) {
    return new Response(LOADING_HTML, {
      status: 503,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  }

  // Chamadas do fetch() da aplicação: o api.js mostra essa mensagem.
  return new Response(
    JSON.stringify({
      error: "waking_up",
      message: "O servidor está acordando. Tente novamente em alguns segundos.",
    }),
    { status: 503, headers: { ...headers, "content-type": "application/json" } },
  );
}

export default {
  async fetch(request, env) {
    const backendUrl = (env.BACKEND_URL || "").replace(/\/+$/, "");
    if (!backendUrl) {
      return new Response("Configuração ausente: defina BACKEND_URL no Worker.", {
        status: 500,
      });
    }

    const url = new URL(request.url);

    // Consultada pelo JavaScript da página de loading (mesmo domínio, sem CORS).
    if (url.pathname === "/__worker-health") {
      const acordado = await acordadoComCache(backendUrl);
      return new Response(JSON.stringify({ acordado }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    if (!(await acordadoComCache(backendUrl))) {
      return respostaDormindo(request);
    }

    return repassarParaBackend(request, backendUrl);
  },
};

// Usado só pelos testes, para começar cada cenário sem cache.
export function _limparCache() {
  ultimoAcordadoEm = 0;
}

const LOADING_HTML = `<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ponto do Entregador</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body {
        display: flex; align-items: center; justify-content: center;
        min-height: 100vh; padding: 1.5rem;
        background: #0f172a; color: #e2e8f0; text-align: center;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      .card { max-width: 420px; width: 100%; }
      .spinner {
        width: 56px; height: 56px; margin: 0 auto 1.75rem; border-radius: 50%;
        border: 4px solid rgba(148, 163, 184, 0.25); border-top-color: #0d6efd;
        animation: girar 0.9s linear infinite;
      }
      @keyframes girar { to { transform: rotate(360deg); } }
      h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 0.6rem; color: #f8fafc; }
      p { margin: 0; color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
      #status { display: block; margin-top: 1rem; font-size: 0.85rem; color: #64748b; min-height: 1.2em; }
      .barra {
        margin-top: 1.75rem; height: 4px; width: 100%; overflow: hidden;
        background: rgba(148, 163, 184, 0.2); border-radius: 999px;
      }
      .barra-preenchida {
        height: 100%; width: 30%; background: #0d6efd; border-radius: 999px;
        animation: deslizar 1.4s ease-in-out infinite;
      }
      @keyframes deslizar { 0% { transform: translateX(-100%); } 100% { transform: translateX(333%); } }
      .erro {
        display: none; margin-top: 1.5rem; padding: 0.75rem 1rem; border-radius: 0.5rem;
        background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.35);
        color: #fca5a5; font-size: 0.85rem;
      }
      .erro.visivel { display: block; }
      .erro a { color: #fecaca; }
      @media (prefers-reduced-motion: reduce) {
        .spinner, .barra-preenchida { animation-duration: 3s; }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="spinner" aria-hidden="true"></div>
      <h1>Preparando o Ponto do Entregador</h1>
      <p>O aplicativo estava em repouso para economizar recursos. Ele já está sendo iniciado e deve ficar pronto em menos de um minuto.</p>
      <div class="barra" aria-hidden="true"><div class="barra-preenchida"></div></div>
      <span id="status" role="status">Conectando...</span>
      <div class="erro" id="erro">
        Está demorando mais do que o esperado.
        <a href="" id="tentar-de-novo">Tentar de novo</a>
      </div>
    </main>
    <script>
      const INTERVALO_MS = 3000;
      const TEMPO_LIMITE_MS = 90000;
      const elStatus = document.getElementById("status");
      const elErro = document.getElementById("erro");
      const inicio = Date.now();
      let tentativas = 0;

      async function verificar() {
        tentativas += 1;
        elStatus.textContent = "Iniciando o servidor... (tentativa " + tentativas + ")";
        try {
          const resposta = await fetch("/__worker-health", { cache: "no-store" });
          const dados = await resposta.json();
          if (dados.acordado) {
            elStatus.textContent = "Pronto! Carregando...";
            // Recarrega a mesma URL: agora o Worker repassa para o backend.
            window.location.reload();
            return;
          }
        } catch (_) {}

        if (Date.now() - inicio > TEMPO_LIMITE_MS) {
          elErro.classList.add("visivel");
          elStatus.textContent = "Continuando a tentar...";
        }
        setTimeout(verificar, INTERVALO_MS);
      }

      document.getElementById("tentar-de-novo").addEventListener("click", (e) => {
        e.preventDefault();
        window.location.reload();
      });

      verificar();
    </script>
  </body>
</html>`;
