// standalone のビルド（.next/standalone）を、静的なファイルをそろえてから起動する。
// Docker のイメージと同じ形で動かすため、E2E テストでも使う。

import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const standalone = `${root}.next/standalone`;
if (!existsSync(`${standalone}/server.js`)) {
  console.error("先に pnpm build を実行してください");
  process.exit(1);
}
cpSync(`${root}public`, `${standalone}/public`, { recursive: true });
cpSync(`${root}.next/static`, `${standalone}/.next/static`, {
  recursive: true,
});

const child = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: process.env.PORT ?? "3000",
  },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
