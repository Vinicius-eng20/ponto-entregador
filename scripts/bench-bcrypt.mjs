// Mede quanto tempo de CPU o bcryptjs gasta em cada custo.
//
// Roda no Node, que usa o mesmo motor JavaScript (V8) do Cloudflare Workers.
// Serve de estimativa para o limite de 10 ms de CPU por requisição do plano
// gratuito. A medição definitiva é o campo cpuTime no Workers Logs, depois
// do deploy.
//
// Uso: npm run bench:bcrypt
import bcrypt from "bcryptjs";

const SENHA = "senha-de-teste-123";
const REPETICOES = 5;

console.log("custo | hash (mediana) | compare (mediana)");
for (const custo of [8, 9, 10, 11, 12]) {
  const tempos = { hash: [], compare: [] };
  let hash = "";

  for (let i = 0; i < REPETICOES; i++) {
    let inicio = process.cpuUsage();
    hash = bcrypt.hashSync(SENHA, custo);
    let uso = process.cpuUsage(inicio);
    tempos.hash.push((uso.user + uso.system) / 1000);

    inicio = process.cpuUsage();
    bcrypt.compareSync(SENHA, hash);
    uso = process.cpuUsage(inicio);
    tempos.compare.push((uso.user + uso.system) / 1000);
  }

  const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  console.log(
    `${String(custo).padStart(5)} | ${mediana(tempos.hash).toFixed(1).padStart(10)} ms | ` +
      `${mediana(tempos.compare).toFixed(1).padStart(11)} ms`,
  );
}
