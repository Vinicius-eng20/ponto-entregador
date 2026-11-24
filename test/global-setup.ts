// Roda no Node, uma vez antes de todos os testes: recria o banco de teste e
// aplica as migrações de db/migrations, na ordem dos nomes dos arquivos.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

import { URL_BANCO_TESTE } from "../vitest.config";

export default async function prepararBanco() {
  const url = new URL(URL_BANCO_TESTE);
  const nome = url.pathname.slice(1);
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(nome)) {
    throw new Error(
      `Os testes apagam e recriam o banco "${nome}". Para não apagar dados reais por engano, ` +
        `o nome do banco em TEST_DATABASE_URL precisa conter "test" (ex.: ponto_test).`,
    );
  }

  // Conecta no banco administrativo "postgres" para recriar o de teste.
  const admin = new URL(URL_BANCO_TESTE);
  admin.pathname = "/postgres";
  const db = new pg.Client({ connectionString: admin.toString() });
  await db.connect();
  try {
    await db.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    await db.query(`CREATE DATABASE ${nome}`);
  } finally {
    await db.end();
  }

  const pasta = path.resolve(import.meta.dirname, "../db/migrations");
  const arquivos = (await readdir(pasta)).filter((a) => a.endsWith(".sql")).sort();
  const teste = new pg.Client({ connectionString: URL_BANCO_TESTE });
  await teste.connect();
  try {
    for (const arquivo of arquivos) {
      await teste.query(await readFile(path.join(pasta, arquivo), "utf8"));
    }
  } finally {
    await teste.end();
  }
}
