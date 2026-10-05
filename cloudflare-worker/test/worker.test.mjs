// Testes do Worker com servidores HTTP falsos que imitam o Render.
// Rodar com: node --test   (dentro de cloudflare-worker/)
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";

import worker, { _limparCache } from "../src/worker.js";

const WORKER_ORIGIN = "https://ponto.exemplo.workers.dev";
let acordado; // backend Flask "de pé"
let dormindo; // Render em cold start: responde HTML de "waking up" com 200
let travado; // aceita a conexão mas nunca responde (cold start lento)

function subir(handler) {
  return new Promise((resolve) => {
    const servidor = http.createServer(handler);
    servidor.listen(0, "127.0.0.1", () => {
      servidor.url = `http://127.0.0.1:${servidor.address().port}`;
      resolve(servidor);
    });
  });
}

before(async () => {
  acordado = await subir((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "ok" }));
    }
    if (req.url === "/redirect-absoluto") {
      res.writeHead(302, { location: `${acordado.url}/login?next=/` });
      return res.end();
    }
    if (req.url === "/redirect-relativo") {
      res.writeHead(302, { location: "/login" });
      return res.end();
    }
    if (req.method === "POST") {
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        res.writeHead(201, {
          "content-type": "application/json",
          "set-cookie": "session=abc; HttpOnly; Path=/",
        });
        res.end(
          JSON.stringify({
            recebido: corpo,
            csrf: req.headers["x-csrftoken"],
            referer: req.headers.referer,
            origin: req.headers.origin,
          }),
        );
      });
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`APP REAL ${req.url}`);
  });

  dormindo = await subir((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>SERVICE WAKING UP...</body></html>");
  });

  travado = await subir(() => {
    /* nunca responde */
  });
});

after(() => {
  for (const s of [acordado, dormindo, travado]) {
    s.closeAllConnections?.();
    s.close();
  }
});

beforeEach(() => _limparCache());

function chamar(caminho, backend, init = {}) {
  const request = new Request(`${WORKER_ORIGIN}${caminho}`, init);
  return worker.fetch(request, { BACKEND_URL: backend.url });
}

const NAVEGACAO = { headers: { accept: "text/html,application/xhtml+xml" } };

test("backend acordado: repassa a página real, preservando path e query", async () => {
  const resposta = await chamar("/registros?mes=9", acordado, NAVEGACAO);
  assert.equal(resposta.status, 200);
  assert.equal(await resposta.text(), "APP REAL /registros?mes=9");
});

test("backend dormindo (HTML do Render no /health): mostra a loading própria", async () => {
  const resposta = await chamar("/", dormindo, NAVEGACAO);
  const corpo = await resposta.text();
  assert.equal(resposta.status, 503);
  assert.match(corpo, /Preparando o Ponto do Entregador/);
  assert.doesNotMatch(corpo, /SERVICE WAKING UP/);
});

test("backend fora do ar (conexão recusada): mostra a loading própria", async () => {
  const request = new Request(`${WORKER_ORIGIN}/`, NAVEGACAO);
  const resposta = await worker.fetch(request, { BACKEND_URL: "http://127.0.0.1:1" });
  assert.equal(resposta.status, 503);
  assert.match(await resposta.text(), /Preparando o Ponto do Entregador/);
});

test("backend travado: desiste após o timeout e mostra a loading", async () => {
  const inicio = Date.now();
  const resposta = await chamar("/", travado, NAVEGACAO);
  assert.equal(resposta.status, 503);
  assert.ok(Date.now() - inicio < 6000, "não deveria esperar mais que ~4s");
});

test("chamada de API com backend dormindo: 503 em JSON com mensagem", async () => {
  const resposta = await chamar("/api/records", dormindo, {
    headers: { accept: "*/*" },
  });
  assert.equal(resposta.status, 503);
  const dados = await resposta.json();
  assert.equal(dados.error, "waking_up");
  assert.ok(dados.message);
});

test("POST com backend acordado: repassa corpo, headers e Set-Cookie", async () => {
  const resposta = await chamar("/api/records", acordado, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrftoken": "tok123" },
    body: JSON.stringify({ earnings: "10" }),
  });
  assert.equal(resposta.status, 201);
  assert.match(resposta.headers.get("set-cookie"), /session=abc/);
  const dados = await resposta.json();
  assert.equal(dados.recebido, '{"earnings":"10"}');
  assert.equal(dados.csrf, "tok123");
});

test("redirect absoluto para o Render é reescrito para o domínio do Worker", async () => {
  const resposta = await chamar("/redirect-absoluto", acordado);
  assert.equal(resposta.status, 302);
  assert.equal(resposta.headers.get("location"), `${WORKER_ORIGIN}/login?next=/`);
});

test("redirect relativo chega intacto ao navegador (não é seguido no Worker)", async () => {
  const resposta = await chamar("/redirect-relativo", acordado);
  assert.equal(resposta.status, 302);
  assert.equal(resposta.headers.get("location"), "/login");
});

test("/__worker-health informa o estado do backend", async () => {
  assert.deepEqual(await (await chamar("/__worker-health", acordado)).json(), {
    acordado: true,
  });
  _limparCache();
  assert.deepEqual(await (await chamar("/__worker-health", dormindo)).json(), {
    acordado: false,
  });
});

test("sem BACKEND_URL configurado: erro claro", async () => {
  const resposta = await worker.fetch(new Request(`${WORKER_ORIGIN}/`), {});
  assert.equal(resposta.status, 500);
});

test("POST: Referer e Origin do Worker viram o domínio do backend (CSRF do Flask)", async () => {
  const resposta = await chamar("/login?next=/", acordado, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: `${WORKER_ORIGIN}/login?next=/`,
      origin: WORKER_ORIGIN,
    },
    body: "email=a%40b.com",
  });
  const dados = await resposta.json();
  assert.equal(dados.referer, `${acordado.url}/login?next=/`);
  assert.equal(dados.origin, acordado.url);
});

test("Referer de outro site é repassado sem alteração", async () => {
  const resposta = await chamar("/api/records", acordado, {
    method: "POST",
    headers: { referer: "https://outro-site.com/pagina" },
    body: "x",
  });
  assert.equal((await resposta.json()).referer, "https://outro-site.com/pagina");
});
