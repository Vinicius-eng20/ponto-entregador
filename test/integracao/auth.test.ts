import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { BASE, limparBanco, Navegador, novaConta, sql } from "../helpers";

beforeEach(limparBanco);

const cadastro = (dados: Record<string, string>) => ({
  name: "Entregador",
  email: "novo@teste.com",
  password: "senha123",
  password_confirm: "senha123",
  ...dados,
});

describe("cadastro", () => {
  it("cria a conta com e-mail em minúsculas, hash bcrypt, e já entra logado", async () => {
    const nav = new Navegador();
    const r = await nav.post("/api/auth/register", cadastro({ email: " Novo@Teste.com " }));

    expect(r.status).toBe(201);
    expect(r.corpo.user).toMatchObject({ name: "Entregador", email: "novo@teste.com" });
    expect(nav.cookies.has("sessao")).toBe(true);

    const [linha] = await sql<{ password_hash: string }>("SELECT password_hash FROM users");
    expect(linha.password_hash).toMatch(/^\$2[aby]\$04\$/);
    expect(linha.password_hash).not.toContain("senha123");

    expect((await nav.get("/api/auth/me")).corpo.user.email).toBe("novo@teste.com");
  });

  it.each([
    [{ name: "" }, "Preencha todos os campos."],
    [{ password_confirm: "outra" }, "As senhas não coincidem."],
    [{ password: "123", password_confirm: "123" }, "A senha deve ter pelo menos 6 caracteres."],
    [
      { password: "a".repeat(73), password_confirm: "a".repeat(73) },
      "A senha deve ter no máximo 72 caracteres.",
    ],
    [{ name: "x".repeat(101) }, "Nome ou e-mail longo demais."],
  ])("recusa %j: %s", async (dados, mensagem) => {
    const r = await new Navegador().post("/api/auth/register", cadastro(dados));
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe(mensagem);
    expect(await sql("SELECT 1 FROM users")).toHaveLength(0);
  });

  it("recusa e-mail já cadastrado, sem diferenciar maiúsculas", async () => {
    await new Navegador().post("/api/auth/register", cadastro({}));
    const r = await new Navegador().post(
      "/api/auth/register",
      cadastro({ email: "NOVO@teste.com" }),
    );
    expect(r.status).toBe(400);
    expect(r.corpo.message).toBe("Já existe uma conta com este e-mail.");
  });
});

describe("login e logout", () => {
  it("login com senha certa abre sessão; com senha errada, 401", async () => {
    const conta = await novaConta();
    const nav = new Navegador();

    const errada = await nav.post("/api/auth/login", { email: conta.email, password: "errada" });
    expect(errada.status).toBe(401);
    expect(errada.corpo.message).toBe("E-mail ou senha inválidos.");
    expect(nav.cookies.has("sessao")).toBe(false);

    const certa = await nav.post("/api/auth/login", {
      email: ` ${conta.email.toUpperCase()} `,
      password: "senha123",
    });
    expect(certa.status).toBe(200);
    expect((await nav.get("/api/auth/me")).status).toBe(200);
  });

  it("e-mail inexistente responde igual a senha errada", async () => {
    const r = await new Navegador().post("/api/auth/login", {
      email: "nao@existe.com",
      password: "x",
    });
    expect(r.status).toBe(401);
    expect(r.corpo.message).toBe("E-mail ou senha inválidos.");
  });

  it("logout apaga o cookie e a API volta a pedir login", async () => {
    const nav = await novaConta();
    const r = await nav.post("/api/auth/logout");
    expect(r.status).toBe(204);
    expect(r.headers.get("set-cookie")).toMatch(/sessao=;.*Max-Age=0/i);
    expect((await nav.get("/api/auth/me")).status).toBe(401);
  });

  it("conta com senha antiga do Flask (scrypt) não entra e não quebra", async () => {
    await sql(
      "INSERT INTO users (name, email, password_hash) VALUES ('Legado', 'legado@teste.com', 'scrypt:32768:8:1$abc$def')",
    );
    const r = await new Navegador().post("/api/auth/login", {
      email: "legado@teste.com",
      password: "qualquer",
    });
    expect(r.status).toBe(401);
  });
});

describe("cookie de sessão", () => {
  it("é HttpOnly, SameSite=Lax, Secure em HTTPS e dura 30 dias", async () => {
    const r = await new Navegador().post("/api/auth/register", cadastro({}));
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Max-Age=2592000/i);
  });

  it("adulterado (outro id de usuário) não autentica", async () => {
    const vitima = await novaConta("Vítima");
    const atacante = await novaConta("Atacante");
    const forjado = new Navegador();
    forjado.cookies.set("sessao", atacante.cookies.get("sessao")!.replace(/^\d+/, "1"));
    expect((await forjado.get("/api/auth/me")).status).toBe(401);
    expect((await vitima.get("/api/auth/me")).corpo.user.name).toBe("Vítima");
  });

  it("deixa de valer quando a senha da conta muda", async () => {
    const nav = await novaConta();
    await sql("UPDATE users SET password_hash = password_hash || 'x'");
    expect((await nav.get("/api/auth/me")).status).toBe(401);
  });

  it("assinado corretamente mas expirado não autentica", async () => {
    await novaConta();
    const [usuario] = await sql<{ id: number; password_hash: string }>(
      "SELECT id, password_hash FROM users",
    );
    const agora = Math.floor(Date.now() / 1000);

    const valido = new Navegador();
    valido.cookies.set(
      "sessao",
      await cookieAssinado(usuario.id, agora + 60, usuario.password_hash),
    );
    expect((await valido.get("/api/auth/me")).status).toBe(200);

    const expirado = new Navegador();
    expirado.cookies.set(
      "sessao",
      await cookieAssinado(usuario.id, agora - 60, usuario.password_hash),
    );
    expect((await expirado.get("/api/auth/me")).status).toBe(401);
  });
});

/** Monta o cookie de sessão como o app: "id.expira.impressao" + assinatura HMAC. */
async function cookieAssinado(id: number, expiraEm: number, hash: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hash));
  const impressao = [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const valor = `${id}.${expiraEm}.${impressao}`;
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(valor));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(assinatura)));
  return encodeURIComponent(`${valor}.${base64}`);
}

describe("páginas com controle de acesso", () => {
  it("sem sessão, /app leva ao login", async () => {
    const r = await new Navegador().get("/app");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/login");
  });

  it("com sessão, /login e /cadastro levam ao painel", async () => {
    const nav = await novaConta();
    expect((await nav.get("/login")).headers.get("location")).toBe("/app");
    expect((await nav.get("/cadastro")).headers.get("location")).toBe("/app");
  });

  it("com sessão, /app abre o painel", async () => {
    const nav = await novaConta();
    const r = await nav.get("/app");
    expect(r.status).toBe(200);
    expect(r.corpo).toContain('id="botao-ponto"');
  });

  it("a origem usada nos testes é a do próprio app", () => {
    expect(new URL(BASE).protocol).toBe("https:");
  });
});
