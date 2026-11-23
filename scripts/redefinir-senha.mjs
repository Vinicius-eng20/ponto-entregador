// Define uma nova senha (bcrypt) para uma conta existente.
//
// As senhas do app Flask usam scrypt do Werkzeug, que o Worker não confere.
// Rode este script uma vez por conta para migrar. Ele também encerra as
// sessões abertas da conta, porque o cookie de sessão depende do hash.
//
// Uso:
//   DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" \
//     node scripts/redefinir-senha.mjs voce@email.com
//
// A senha é pedida no terminal (não aparece na tela nem no histórico).
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import pg from "pg";

const CUSTO = Number(process.env.BCRYPT_COST ?? 10);

/**
 * Pergunta as senhas no terminal sem mostrar o que é digitado. Uma única
 * interface para as duas perguntas: com duas, a primeira pode consumir a
 * linha da segunda.
 */
function perguntarSenhas(perguntas) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let pergunta = "";
  rl._writeToOutput = (texto) => {
    if (texto.includes(pergunta)) rl.output.write(pergunta);
  };
  const respostas = [];
  return new Promise((resolve) => {
    const proxima = () => {
      if (respostas.length === perguntas.length) {
        rl.close();
        return resolve(respostas);
      }
      pergunta = perguntas[respostas.length];
      rl.question(pergunta, (resposta) => {
        process.stdout.write("\n");
        respostas.push(resposta);
        proxima();
      });
    };
    proxima();
  });
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.DATABASE_URL;

if (!email || !url) {
  console.error("Uso: DATABASE_URL=... node scripts/redefinir-senha.mjs <email>");
  process.exit(1);
}

const db = new pg.Client({ connectionString: url });
await db.connect();

try {
  const { rows } = await db.query("SELECT id, name FROM users WHERE email = $1", [email]);
  if (rows.length === 0) {
    console.error(`Nenhuma conta com o e-mail ${email}.`);
    process.exit(1);
  }

  const [senha, confirmacao] = process.env.NOVA_SENHA
    ? [process.env.NOVA_SENHA, process.env.NOVA_SENHA]
    : await perguntarSenhas(["Nova senha: ", "Repita a nova senha: "]);

  if (senha !== confirmacao) {
    console.error("As senhas não coincidem. Nada foi alterado.");
    process.exit(1);
  }
  if (senha.length < 6 || new TextEncoder().encode(senha).length > 72) {
    console.error("A senha deve ter entre 6 e 72 caracteres. Nada foi alterado.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(senha, CUSTO);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, rows[0].id]);
  console.log(`Senha de ${rows[0].name} (${email}) redefinida com bcrypt, custo ${CUSTO}.`);
} finally {
  await db.end();
}
