// 子ども向けの画面で最初に読み込む JavaScript の大きさを測る（U1-PERF-2）。
// ビルドで書き出した HTML から <script src> を拾い、gzip で圧縮した大きさを合計する。
// 予算（200KB）を超えたら失敗にする。使い方：pnpm build && pnpm check:bundle
import { existsSync, readFileSync } from "node:fs";
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
];
const OTHER_ROUTES = [
  "login",
  "consent",
  "parent",
  "parent/rules",
  "parent/data",
];

const root = new URL("..", import.meta.url).pathname;
const sizeCache = new Map();

function gzipKb(file) {
  if (!sizeCache.has(file)) {
    sizeCache.set(file, gzipSync(readFileSync(file)).length / 1024);
  }
  return sizeCache.get(file);
}

function measure(route) {
  const htmlPath = `${root}.next/server/app/${route}.html`;
  if (!existsSync(htmlPath))
    throw new Error(
      `${htmlPath} がありません。先に pnpm build を実行してください`,
    );
  const html = readFileSync(htmlPath, "utf8");
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
  return { route: route === "index" ? "/" : `/${route}`, kb, files: srcs.size };
}

let failed = false;
console.log(
  `最初に読み込む JavaScript（gzip）／ 予算 ${BUDGET_KB}KB（子ども向けの画面）`,
);
for (const route of [...KID_ROUTES, ...OTHER_ROUTES]) {
  const r = measure(route);
  const isKid = KID_ROUTES.includes(route);
  const over = isKid && r.kb > BUDGET_KB;
  if (over) failed = true;
  console.log(
    `${over ? "✗" : "✓"} ${r.route.padEnd(30)} ${r.kb.toFixed(1).padStart(7)} KB  (${r.files} files)${isKid ? "" : "  ※予算の対象外"}`,
  );
}
if (failed) {
  console.error(`予算（${BUDGET_KB}KB）を超えた画面があります`);
  process.exit(1);
}
