// Aplica as migrações de db/migrations no banco, em ordem.
//
// Uso (qualquer terminal, inclusive PowerShell e cmd):
//   npm run migrar
//
// O script pergunta a connection string do Neon (ou usa DATABASE_URL).
// Todas as migrações são escritas para poder rodar de novo sem efeito
// (CREATE ... IF NOT EXISTS), então rodar o script mais de uma vez é seguro.
import { readdir, readFile } from "node:fs/promises";

import { conectar, executar, urlDoBanco } from "./lib/banco.mjs";

const PASTA = new URL("../db/migrations/", import.meta.url);

await executar(async () => {
  const url = await urlDoBanco();
  const arquivos = (await readdir(PASTA)).filter((nome) => nome.endsWith(".sql")).sort();

  const db = await conectar(url);
  try {
    for (const arquivo of arquivos) {
      await db.query(await readFile(new URL(arquivo, PASTA), "utf8"));
      console.log(`ok  ${arquivo}`);
    }
    console.log(`${arquivos.length} migração(ões) aplicada(s).`);
  } finally {
    await db.end();
  }
});
