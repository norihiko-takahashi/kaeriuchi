/**
 * AI の評価（BR-U2-6）。
 *   pnpm eval --provider mock|bedrock --suite analyze|generate
 * Bedrock で動かすと費用がかかる。CI では mock だけを使う（評価の仕組みが壊れていないかの確認）。
 * 結果は evals/reports/ に Markdown と JSON で出す（リポジトリには入れない。PR に貼る）。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { mistakeTypeCatalog } from "@/server/ai/catalog";
import {
  analyzePrompt,
  generatePrompt,
  solvePrompt,
} from "@/server/ai/prompts";
import type { AIProvider, Usage } from "@/server/ai/provider";
import { getProvider } from "@/server/ai/registry";
import type { MistakeAnalysis, Subject } from "@/server/ai/schemas";
import { estimateCostJpy } from "@/server/ai/telemetry";
import { parseConfig } from "@/server/config";
import { MIN_PROBLEMS, runPipeline } from "@/server/problems/pipeline";
import type { Grade } from "@/shared/constants";

const { values } = parseArgs({
  options: {
    provider: { type: "string", default: "mock" },
    suite: { type: "string", default: "analyze" },
  },
});

const root = new URL("./", import.meta.url).pathname;
const config = parseConfig({ ...process.env, AI_PROVIDER: values.provider });
const provider: AIProvider = getProvider(config);

const norm = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

interface Row {
  id: string;
  ok: boolean;
  details: Record<string, boolean | string>;
  latencyMs: number;
  costJpy: number;
}

async function runAnalyze(): Promise<{
  rows: Row[];
  promptVersions: string[];
}> {
  const suite = JSON.parse(
    readFileSync(`${root}suites/analyze/samples.json`, "utf8"),
  );
  const rows: Row[] = [];
  for (const s of suite.samples) {
    const data = new Uint8Array(
      readFileSync(`${root}suites/analyze/${s.image}`),
    );
    const started = Date.now();
    try {
      const { value, usage } = await provider.analyzeMistake(
        {
          image: {
            mime: s.image.endsWith(".png") ? "image/png" : "image/jpeg",
            data,
          },
          grade: s.grade as Grade,
          subjectHint: s.subject as Subject,
          mistakeTypeCatalog: mistakeTypeCatalog(s.subject),
        },
        { requestId: `eval-${s.id}` },
      );
      const details: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(
        s.expected as Record<string, string>,
      )) {
        details[k] =
          norm(String(value[k as keyof MistakeAnalysis])) === norm(v);
      }
      rows.push({
        id: s.id,
        ok: Object.values(details).every(Boolean),
        details,
        latencyMs: Date.now() - started,
        costJpy: estimateCostJpy(usage),
      });
    } catch (e) {
      rows.push({
        id: s.id,
        ok: false,
        details: { error: (e as Error).name },
        latencyMs: Date.now() - started,
        costJpy: 0,
      });
    }
  }
  return { rows, promptVersions: [analyzePrompt.id] };
}

/**
 * 生成の評価：本番と同じ流れ（生成 → 安全 → 検証 → 作り直し）で動かし、
 * 通った数、落とした理由、1問目までの時間、費用を測る（U45-Q-5、U45-COST-2）。
 * 検証をすり抜けた誤りの率は、出た問題を人が確かめて数える（レポートの「人の確認」の欄）。
 */
async function runGenerate(): Promise<{
  rows: Row[];
  promptVersions: string[];
}> {
  const suite = JSON.parse(
    readFileSync(`${root}suites/generate/samples.json`, "utf8"),
  );
  const rows: Row[] = [];
  for (const s of suite.samples) {
    const started = Date.now();
    let firstMs = -1;
    let cost = 0;
    const reasons: string[] = [];
    try {
      const problems: string[] = [];
      let meta:
        | { verified: number; rejected: number; regenerated: boolean }
        | undefined;
      for await (const line of runPipeline(
        provider,
        {
          analysis: s.analysis,
          grade: s.grade,
          mode: s.mode ?? "first",
          avoid: [],
        },
        { requestId: `eval-${s.id}`, signal: AbortSignal.timeout(30_000) },
        {
          onUsage: (_role, u: Usage) => {
            cost += estimateCostJpy(u) || 0;
          },
          onReject: (r) => reasons.push(r),
        },
      )) {
        if ("problem" in line) {
          if (firstMs < 0) firstMs = Date.now() - started;
          problems.push(
            `[${line.problem.verification.method}] ${line.problem.prompt} → ${line.problem.answer}`,
          );
        } else if ("done" in line) meta = line.meta;
      }
      const details: Record<string, boolean | string> = {
        enough: (meta?.verified ?? 0) >= MIN_PROBLEMS,
        verified: `${meta?.verified ?? 0}`,
        rejected: reasons.join("/") || "0",
        regenerated: meta?.regenerated ? "yes" : "no",
        firstProblemMs: `${firstMs}`,
        firstWithin10s: firstMs >= 0 && firstMs <= 10_000,
        人の確認: problems.join(" ／ "),
      };
      rows.push({
        id: s.id,
        ok: details.enough === true && details.firstWithin10s === true,
        details,
        latencyMs: Date.now() - started,
        costJpy: Math.round(cost * 100) / 100,
      });
    } catch (e) {
      rows.push({
        id: s.id,
        ok: false,
        details: { error: (e as Error).name },
        latencyMs: Date.now() - started,
        costJpy: Math.round(cost * 100) / 100,
      });
    }
  }
  return { rows, promptVersions: [generatePrompt.id, solvePrompt.id] };
}

const runners = { analyze: runAnalyze, generate: runGenerate } as const;
const suiteName = values.suite as keyof typeof runners;
if (!runners[suiteName]) throw new Error(`知らない評価です: ${values.suite}`);

const { rows, promptVersions } = await runners[suiteName]();
const passed = rows.filter((r) => r.ok).length;
const latencies = rows.map((r) => r.latencyMs);
const totalCost = rows.reduce(
  (a, r) => a + (Number.isFinite(r.costJpy) ? r.costJpy : 0),
  0,
);
const summary = {
  suite: suiteName,
  provider: provider.name,
  promptVersions,
  at: new Date().toISOString(),
  samples: rows.length,
  passRate: rows.length ? passed / rows.length : 0,
  latencyP50Ms: percentile(latencies, 50),
  latencyP90Ms: percentile(latencies, 90),
  costJpyTotal: Math.round(totalCost * 100) / 100,
  costJpyPerSample: rows.length
    ? Math.round((totalCost / rows.length) * 100) / 100
    : 0,
};

const md = [
  `# 評価：${summary.suite}（${summary.provider}）`,
  "",
  `- 日時：${summary.at}`,
  `- プロンプト：${promptVersions.join("、")}`,
  `- サンプル：${summary.samples}件、合格：${passed}件（${Math.round(summary.passRate * 100)}%）`,
  `- 処理時間：p50 ${summary.latencyP50Ms}ms、p90 ${summary.latencyP90Ms}ms`,
  `- 費用の目安：合計 ${summary.costJpyTotal}円、1件あたり ${summary.costJpyPerSample}円（目標 10円以内）`,
  "",
  "| サンプル | 結果 | 内訳 | 時間 | 費用 |",
  "|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.id} | ${r.ok ? "✓" : "✗"} | ${Object.entries(r.details)
        .map(([k, v]) => `${k}:${v === true ? "✓" : v === false ? "✗" : v}`)
        .join(" ")} | ${r.latencyMs}ms | ${r.costJpy}円 |`,
  ),
  "",
].join("\n");

mkdirSync(`${root}reports`, { recursive: true });
const stamp = summary.at.replace(/[:.]/g, "-");
writeFileSync(`${root}reports/${suiteName}-${provider.name}-${stamp}.md`, md);
writeFileSync(
  `${root}reports/${suiteName}-${provider.name}-${stamp}.json`,
  JSON.stringify({ summary, rows }, null, 2),
);
console.log(md);
// 評価の仕組みの確認として、Mock では全件合格でなければ失敗にする
if (provider.name === "mock" && passed !== rows.length) process.exit(1);
