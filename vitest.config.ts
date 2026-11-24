import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Banco Postgres usado pelos testes. Ele é recriado do zero a cada execução
 * (veja test/global-setup.ts), então nunca aponte para um banco com dados reais.
 *   - local:  docker compose run --rm test
 *   - CI:     serviço postgres do GitHub Actions
 */
export const URL_BANCO_TESTE =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/ponto_test";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          SESSION_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres",
          // Custo mínimo do bcrypt: os testes conferem o comportamento, não a força do hash.
          BCRYPT_COST: "4",
        },
        hyperdrives: { HYPERDRIVE: URL_BANCO_TESTE },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Todos os arquivos usam o mesmo banco e o limpam entre os testes.
    fileParallelism: false,
    // Os logs JSON do app só aparecem nos testes que falham.
    silent: "passed-only",
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      reporter: ["text", "text-summary"],
      // O que não é coberto são caminhos de falha difíceis de provocar em teste
      // (banco fora do ar, erro 500 genérico, corrida no índice único).
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});
