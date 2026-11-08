// アプリのアイコン（PNG）を public/icons/icon.svg から作る。
// 使い方：node scripts/generate-icons.mjs（Playwright の Chromium を使う）
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile(
  new URL("../public/icons/icon.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  // maskable は、端が切り取られても大丈夫なように余白をとる
  { file: "icon-maskable-512.png", size: 512, padding: 64, bg: "#c2410c" },
  { file: "apple-touch-icon.png", size: 180, padding: 0 },
];
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = t.size - t.padding * 2;
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg ?? "transparent"};display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  );
  await page.screenshot({
    path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname,
    omitBackground: !t.bg,
  });
}
await browser.close();
console.log("generated", targets.map((t) => t.file).join(", "));
