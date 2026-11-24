// Define uma nova senha (bcrypt) para uma conta existente.
//
// As senhas do app Flask usam scrypt do Werkzeug, que o Worker não confere.
// Rode este script uma vez por conta para migrar. Ele também encerra as
// sessões abertas da conta, porque o cookie de sessão depende do hash.
// Os registros de ponto não são alterados.
//
// Uso (qualquer terminal, inclusive PowerShell e cmd):
//   npm run redefinir-senha
//
// O script pergunta a connection string do Neon, o e-mail da conta e a nova
// senha (duas vezes). Nada do que é secreto aparece na tela ou no histórico.
// Opcionais: o e-mail como argumento (npm run redefinir-senha -- voce@email.com)
// e a connection string na variável DATABASE_URL.
import bcrypt from "bcryptjs";

import { conectar, ErroDeUso, executar, urlDoBanco } from "./lib/banco.mjs";
import { perguntar } from "./lib/terminal.mjs";

const CUSTO = Number(process.env.BCRYPT_COST ?? 10);

await executar(async () => {
  const url = await urlDoBanco();
  let email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    [email] = await perguntar([{ texto: "E-mail da conta: " }]);
    email = email.toLowerCase();
  }
  if (!email) throw new ErroDeUso("Informe o e-mail da conta.");

  const db = await conectar(url);
  try {
    const { rows } = await db.query("SELECT id, name FROM users WHERE email = $1", [email]);
    if (rows.length === 0) {
      throw new ErroDeUso(`Nenhuma conta com o e-mail ${email} nesse banco.`);
    }

    const [senha, confirmacao] = process.env.NOVA_SENHA
      ? [process.env.NOVA_SENHA, process.env.NOVA_SENHA]
      : await perguntar([
          { texto: "Nova senha: ", oculta: true },
          { texto: "Repita a nova senha: ", oculta: true },
        ]);

    if (senha !== confirmacao) {
      throw new ErroDeUso("As senhas não coincidem. Nada foi alterado.");
    }
    if (senha.length < 6 || new TextEncoder().encode(senha).length > 72) {
      throw new ErroDeUso("A senha deve ter entre 6 e 72 caracteres. Nada foi alterado.");
    }

    const hash = await bcrypt.hash(senha, CUSTO);
    await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, rows[0].id]);
    console.log(`Senha de ${rows[0].name} (${email}) redefinida com bcrypt, custo ${CUSTO}.`);
  } finally {
    await db.end();
  }
});
