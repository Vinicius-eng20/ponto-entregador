// Tipos do ambiente de teste: os bindings de `env` são os mesmos do app, e
// `exports.default` é o Worker de src/index.ts.
import type * as App from "../src/index";
import type { Env as EnvDoApp } from "../src/types";

declare global {
  namespace Cloudflare {
    interface Env extends EnvDoApp {}
    interface GlobalProps {
      mainModule: typeof App;
    }
  }
}
