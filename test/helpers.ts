// Utilitários dos testes. Rodam dentro do runtime do Workers, junto com o app.
import { env, exports } from "cloudflare:workers";
import pg from "pg";

// Carrega o db.ts do app para registrar os mesmos conversores de tipo do
// driver (DATE e TIME como texto, NUMERIC como número).
import "../src/db";

export const BASE = "https://ponto.test";

/** Executa SQL direto no banco de teste (para preparar ou conferir dados). */
export async function sql<T = Record<string, unknown>>(
  consulta: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const cliente = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
  cliente.on("error", () => undefined);
  await cliente.connect();
  try {
    return (await cliente.query(consulta, parametros)).rows as T[];
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

export async function limparBanco(): Promise<void> {
  await sql("TRUNCATE work_records, users RESTART IDENTITY CASCADE");
}

/** Data de hoje (AAAA-MM-DD) em São Paulo, o fuso do app. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

interface OpcoesRequisicao {
  json?: unknown;
  headers?: Record<string, string>;
  corpo?: string;
}

export interface Resposta<T = any> {
  status: number;
  corpo: T;
  headers: Headers;
}

/** Cliente HTTP com cookies, como um navegador, chamando o Worker de verdade. */
export class Navegador {
  cookies = new Map<string, string>();

  async req<T = any>(
    metodo: string,
    caminho: string,
    { json, headers = {}, corpo }: OpcoesRequisicao = {},
  ): Promise<Resposta<T>> {
    const cabecalhos: Record<string, string> = { origin: BASE, ...headers };
    if (this.cookies.size) {
      cabecalhos.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    if (json !== undefined) cabecalhos["content-type"] = "application/json";

    const resposta = await exports.default.fetch(
      new Request(BASE + caminho, {
        method: metodo,
        headers: cabecalhos,
        body: json !== undefined ? JSON.stringify(json) : corpo,
        redirect: "manual",
      }),
    );

    for (const cookie of resposta.headers.getSetCookie()) {
      const [par] = cookie.split(";");
      const i = par.indexOf("=");
      const [nome, valor] = [par.slice(0, i), par.slice(i + 1)];
      if (/max-age=0/i.test(cookie) || valor === "") this.cookies.delete(nome);
      else this.cookies.set(nome, valor);
    }

    const tipo = resposta.headers.get("content-type") ?? "";
    const dados = tipo.includes("json") ? await resposta.json() : await resposta.text();
    return { status: resposta.status, corpo: dados as T, headers: resposta.headers };
  }

  get = <T = any>(caminho: string) => this.req<T>("GET", caminho);
  post = <T = any>(caminho: string, json?: unknown) => this.req<T>("POST", caminho, { json });
  put = <T = any>(caminho: string, json?: unknown) => this.req<T>("PUT", caminho, { json });
  delete = <T = any>(caminho: string) => this.req<T>("DELETE", caminho);
}

let contador = 0;

/** Cria uma conta pela API e devolve o navegador já logado. */
export async function novaConta(nome = "Entregador"): Promise<Navegador & { email: string }> {
  const nav = new Navegador() as Navegador & { email: string };
  nav.email = `conta${++contador}@teste.com`;
  const r = await nav.post("/api/auth/register", {
    name: nome,
    email: nav.email,
    password: "senha123",
    password_confirm: "senha123",
  });
  if (r.status !== 201) throw new Error(`cadastro falhou: ${JSON.stringify(r.corpo)}`);
  return nav;
}

/** Cria um turno completo pela API (botão +). */
export async function criarTurno(
  nav: Navegador,
  date: string,
  start_time: string,
  end_time: string,
  earnings: number | string,
  costs: number | string,
) {
  const r = await nav.post("/api/records", { date, start_time, end_time, earnings, costs });
  if (r.status !== 201) throw new Error(`criar turno falhou: ${JSON.stringify(r.corpo)}`);
  return r.corpo;
}
