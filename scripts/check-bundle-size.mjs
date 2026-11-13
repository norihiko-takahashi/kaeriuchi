// 子ども向けの画面で最初に読み込む JavaScript の大きさを測る（U1-PERF-2）。
// standalone のサーバーを起動して各画面の HTML を取得し、<script src> を拾って、
// gzip で圧縮した大きさを合計する。予算（200KB）を超えたら失敗にする。
// （画面は CSP の nonce のためにリクエストのたびに描画するので、ビルドの出力には HTML がない）
// 使い方：pnpm build && pnpm check:bundle
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 200;
/** 子ども向けの画面（保護者向けの画面も念のため測るが、予算は子ども向けにだけかける） */
const KID_ROUTES = [
  "index",
  "profiles",
  "home",
  "profiles/new",
  "profiles/new/nickname-guide",
  "profiles/new/nickname",
  "mistakes/new",
  "capture",
  "mistakes/found",
  "battle",
  "sheets",
  "sheets/detail",
  "dex",
];
const OTHER_ROUTES = [
  "login",
  "consent",
  "parent",
  "parent/rules",
  "parent/data",
  "parent/reports",
  "parent/insights",
  "parent/insights/day",
];

const root = new URL("..", import.meta.url).pathname;
const sizeCache = new Map();

function gzipKb(file) {
  if (!sizeCache.has(file)) {
    sizeCache.set(file, gzipSync(readFileSync(file)).length / 1024);
  }
  return sizeCache.get(file);
}

const PORT = 3300;
const base = `http://127.0.0.1:${PORT}`;

async function startServer() {
  const child = spawn(
    process.execPath,
    [`${root}scripts/start-standalone.mjs`],
    {
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
    },
  );
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return child;
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(
    "サーバーが起動しませんでした。先に pnpm build を実行してください",
  );
}

async function measure(route) {
  const path = route === "index" ? "/" : `/${route}`;
  const html = await (await fetch(`${base}${path}`)).text();
  const srcs = new Set();
  // 自分たちのビルドの出力を数えるだけで、HTML の無害化には使わない。
  // タグや属性の大文字・小文字は区別しない
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (/\bnomodule\b/i.test(attrs)) continue; // 古いブラウザ向けの polyfill は除く
    const src = /\bsrc\s*=\s*"([^"]+\.js)"/i.exec(attrs)?.[1];
    if (src?.startsWith("/_next/")) srcs.add(src);
  }
  let kb = 0;
  for (const src of srcs)
    kb += gzipKb(`${root}.next/${src.replace(/^\/_next\//, "")}`);
  return { route: path, kb, files: srcs.size };
}

let failed = false;
const server = await startServer();
try {
  console.log(
    `最初に読み込む JavaScript（gzip）／ 予算 ${BUDGET_KB}KB（子ども向けの画面）`,
  );
  for (const route of [...KID_ROUTES, ...OTHER_ROUTES]) {
    const r = await measure(route);
    const isKid = KID_ROUTES.includes(route);
    const over = isKid && r.kb > BUDGET_KB;
    if (over) failed = true;
    console.log(
      `${over ? "✗" : "✓"} ${r.route.padEnd(30)} ${r.kb.toFixed(1).padStart(7)} KB  (${r.files} files)${isKid ? "" : "  ※予算の対象外"}`,
    );
  }
} finally {
  server.kill();
}
if (failed) {
  console.error(`予算（${BUDGET_KB}KB）を超えた画面があります`);
  process.exit(1);
}
