// Conexão com o Postgres (Neon) para os scripts de manutenção.
import pg from "pg";

import { fecharTerminal, perguntar } from "./terminal.mjs";

/**
 * Limpa a connection string colada no terminal: espaços, aspas e o "psql "
 * que o painel do Neon coloca na frente quando se copia o comando inteiro.
 */
export function limparUrl(texto) {
  return (texto ?? "")
    .trim()
    .replace(/^psql\s+/, "")
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();
}

/**
 * Hoje o driver `pg` já trata `sslmode=require` como `verify-full` (confere o
 * certificado), mas imprime um aviso de segurança grande a cada execução.
 * Pedir `verify-full` explicitamente mantém o mesmo comportamento sem o aviso.
 */
export function ajustarSsl(url) {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}

/** Usa DATABASE_URL se existir; senão, pergunta (sem mostrar a senha na tela). */
export async function urlDoBanco() {
  let url = limparUrl(process.env.DATABASE_URL);
  if (!url) {
    console.log("Cole a connection string do Neon (painel do Neon > Connect).");
    [url] = await perguntar([{ texto: "Connection string: ", oculta: true }]);
    url = limparUrl(url);
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new ErroDeUso(
      "A connection string deve começar com postgresql:// (copie do painel do Neon, em Connect).",
    );
  }
  return ajustarSsl(url);
}

/** Erro já explicado para o usuário: o script mostra só a mensagem. */
export class ErroDeUso extends Error {}

/** Traduz falhas comuns de conexão em mensagens que dizem o que fazer. */
export function explicarErroDeConexao(erro, url) {
  let host = "o servidor";
  try {
    host = new URL(url).hostname;
  } catch {}
  switch (erro.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `Não encontrei ${host}. Confira a connection string e a sua internet.`;
    case "ECONNREFUSED":
      return `Conexão recusada por ${host}. O banco está no ar?`;
    case "ETIMEDOUT":
      return `${host} não respondeu a tempo. Confira a internet ou tente de novo.`;
    case "28P01":
      return "Usuário ou senha do banco recusados. Copie a connection string de novo no painel do Neon.";
    case "3D000":
      return "Esse banco não existe no servidor. Confira o nome do banco no fim da connection string.";
    default:
      return `Não consegui conectar ao banco: ${erro.message}`;
  }
}

/** Conecta e devolve o cliente, ou lança ErroDeUso com uma mensagem clara. */
export async function conectar(url) {
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  try {
    await db.connect();
  } catch (erro) {
    await db.end().catch(() => {});
    throw new ErroDeUso(explicarErroDeConexao(erro, url));
  }
  return db;
}

/** Roda o script principal mostrando só a mensagem nos erros já explicados. */
export async function executar(principal) {
  try {
    await principal();
  } catch (erro) {
    console.error(erro instanceof ErroDeUso ? erro.message : erro);
    process.exitCode = 1;
  } finally {
    fecharTerminal();
  }
}
