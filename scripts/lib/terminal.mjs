// Perguntas no terminal para os scripts de manutenção.
//
// Funciona igual no PowerShell, no cmd, no Git Bash e no Linux/macOS: nada
// depende da sintaxe do shell para passar variáveis de ambiente.
import { createInterface } from "node:readline";

const terminal = Boolean(process.stdin.isTTY);

// Uma única interface para o script inteiro. Com uma por pergunta, a primeira
// pode consumir as linhas das seguintes (por exemplo, numa entrada colada).
let rl = null;
let atual = { texto: "", oculta: false };
const linhas = [];
const esperando = [];
let encerrada = false;
let avisado = false;

function abrir() {
  if (rl) return rl;
  rl = createInterface({ input: process.stdin, output: process.stdout, terminal });
  const escrever = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (texto) => {
    if (!atual.oculta || !terminal) return escrever(texto);
    // Ao esconder, só o texto da pergunta vai para a tela.
    if (texto.includes(atual.texto)) rl.output.write(atual.texto);
  };
  rl.on("line", (linha) => {
    const proximo = esperando.shift();
    if (proximo) proximo(linha);
    else linhas.push(linha);
  });
  rl.on("close", () => {
    encerrada = true;
    for (const proximo of esperando.splice(0)) proximo("");
  });
  return rl;
}

function lerLinha() {
  if (linhas.length > 0) return Promise.resolve(linhas.shift());
  if (encerrada) return Promise.resolve("");
  return new Promise((resolve) => esperando.push(resolve));
}

/**
 * Faz as perguntas em sequência e devolve as respostas na mesma ordem.
 *
 * `{ texto, oculta }`: com `oculta`, o que é digitado não aparece na tela.
 */
export async function perguntar(perguntas) {
  const leitor = abrir();
  if (!terminal && !avisado && perguntas.some((p) => p.oculta)) {
    avisado = true;
    console.warn("Aviso: este terminal não permite esconder a digitação.");
  }
  const respostas = [];
  for (const pergunta of perguntas) {
    atual = pergunta;
    leitor.setPrompt(pergunta.texto);
    leitor.prompt();
    const resposta = await lerLinha();
    if (pergunta.oculta && terminal) process.stdout.write("\n");
    respostas.push(resposta.trim());
  }
  atual = { texto: "", oculta: false };
  return respostas;
}

/** Libera o terminal. Sem isso, o Node fica esperando entrada e não termina. */
export function fecharTerminal() {
  rl?.close();
}
