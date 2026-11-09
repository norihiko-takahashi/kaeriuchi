// 評価用の、合成した宿題の画像を作る（content-data-plan.md の B2）。
// 問題の文字・手書き風の答え・赤ペンの ✗ を組み合わせて、PNG にする。
// 使い方：node evals/scripts/make-synthetic.mjs
import { chromium } from "@playwright/test";

const out = new URL("../suites/analyze/images/", import.meta.url).pathname;
const samples = [
  { file: "math-fraction-01.png", question: "1/2 + 1/3 =", answer: "2/5" },
  {
    file: "english-3rd-person-01.png",
    question: "He (   ) to school every day. (go)",
    answer: "go",
  },
  {
    file: "japanese-reading-01.png",
    question: "「植物」の読みを書きましょう。",
    answer: "しょくぶち",
  },
];

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
for (const s of samples) {
  await page.setContent(`<html><body style="margin:0;background:#fdfcf7;font-family:sans-serif">
    <div style="position:relative;width:640px;height:240px">
      <div style="position:absolute;left:30px;top:40px;font-size:30px;color:#222">${s.question}</div>
      <div style="position:absolute;left:60px;top:120px;font-size:44px;color:#333;font-family:cursive;transform:rotate(-3deg)">${s.answer}</div>
      <svg style="position:absolute;left:420px;top:100px" width="90" height="90"><path d="M10 10 L80 80 M80 10 L10 80" stroke="#d11" stroke-width="8" stroke-linecap="round"/></svg>
    </div></body></html>`);
  await page.screenshot({ path: out + s.file });
}
await browser.close();
console.log("generated", samples.map((s) => s.file).join(", "));
