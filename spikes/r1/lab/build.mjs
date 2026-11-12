// R1 の測定ページを、1つの HTML にまとめる（Claude の Artifact として出すため）。
//   node spikes/r1/lab/build.mjs <出力先>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL("./", import.meta.url).pathname;
const out = process.argv[2] ?? `${here}r1-lab.html`;
const js = execFileSync(
  `${here}../../../node_modules/.bin/esbuild`,
  [
    `${here}entry.ts`,
    "--bundle",
    "--format=iife",
    "--minify",
    "--target=es2020",
  ],
  { encoding: "utf8" },
);
const html = readFileSync(`${here}page.html`, "utf8")
  // Worker でもページでも同じコードを使う
  .replace("/*__R1_CODE__*/", () => `const R1_CODE = ${JSON.stringify(js)};`);
writeFileSync(out, html);
console.log(`書き出しました: ${out}（${Math.round(html.length / 1024)}KB）`);
