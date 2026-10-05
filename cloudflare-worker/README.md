# Cloudflare Worker (porta de entrada do app)

Esconde a tela de "SERVICE WAKING UP" do Render. O plano gratuito do Render
hiberna o backend após 15 minutos sem acesso, e a próxima visita espera de 30
a 60 segundos olhando a tela de log do Render. Com este Worker na frente, quem
espera vê uma tela de carregamento do próprio app.

```
navegador ──► Worker (Cloudflare, nunca hiberna) ──► Render (Flask)
                 │
                 └─ backend dormindo? responde a loading na hora
```

## Como funciona

A cada requisição, o Worker:

1. Faz `GET /health` no Render, com timeout de 4s. Só conta como acordado se a
   resposta for o JSON `{"status": "ok"}` do Flask. A página HTML do Render
   com status 200 não conta.
2. **Acordado:** repassa a requisição sem alterar nada (método, headers,
   corpo, cookies, path e query). Redirects absolutos que apontam para o
   `onrender.com` são reescritos para o domínio do Worker.
3. **Dormindo:** devolve na hora a página de loading (navegação) ou um `503`
   em JSON (chamadas `fetch` da aplicação). Essa mesma checagem já acorda o
   Render. A página de loading consulta `/__worker-health` a cada 3s e
   recarrega quando o backend responde.

Depois de uma resposta positiva, o Worker não checa de novo por 60s. Isso
evita uma ida extra ao Render a cada CSS ou chamada de API (o Render só dorme
depois de 15 minutos parado).

## Importante: qual URL usar

O Worker só intercepta o que chega **na URL dele**. O endereço
`ponto-entregador.onrender.com` é do Render e não passa pela Cloudflare: quem
abrir esse endereço direto continua vendo a tela do Render quando o backend
estiver dormindo. Por isso:

- A URL que você usa, salva nos favoritos e compartilha passa a ser a do
  Worker (`https://ponto-entregador.<seu-subdominio>.workers.dev`, ou um
  domínio próprio).
- Trate `onrender.com` como endereço interno. Atualize favoritos e atalhos na
  tela do celular.

## Publicar

Pré-requisitos: conta gratuita na Cloudflare e Node.js 18+.

```bash
cd cloudflare-worker
npm install
npx wrangler login        # abre o navegador para autorizar
```

1. Confira `BACKEND_URL` em `wrangler.toml` (a URL do seu Web Service no
   Render, sem barra no final).
2. Teste localmente contra o Render de verdade:
   ```bash
   npm run dev               # abre em http://localhost:8787
   ```
3. Publique:
   ```bash
   npm run deploy
   ```
   O comando mostra a URL final (`https://ponto-entregador.<subdominio>.workers.dev`).
   Na primeira vez a Cloudflare pede para você escolher esse subdomínio.

### Domínio próprio (opcional)

Se você tiver um domínio gerenciado pela Cloudflare, descomente o bloco
`routes` em `wrangler.toml` com o seu domínio e rode `npm run deploy` de novo.
A Cloudflare cria o DNS e o certificado HTTPS.

## Testes

```bash
npm test
```

Os testes sobem servidores HTTP falsos que imitam o Render nos três estados:
acordado, dormindo (HTML de "waking up" com status 200) e travado (nunca
responde). Eles cobrem o repasse de página, POST, cookie e redirects, e a
resposta da API durante o cold start. Rodam no CI junto com os testes do
Flask.

## Custos e limites

- O plano gratuito de Workers permite 100 mil requisições por dia, bem acima
  do uso de um app pessoal.
- O cold start do Render continua levando 30 a 60s. O Worker troca a tela
  durante a espera, mas não reduz o tempo.
- Cada requisição ganha alguns milissegundos por passar pela Cloudflare.
