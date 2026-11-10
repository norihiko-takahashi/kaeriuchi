import { describe, expect, it } from "vitest";
import type { AIProvider, GenerateInput } from "@/server/ai/provider";
import { createMockProvider } from "@/server/ai/providers/mock/index";
import type { MistakeAnalysis, ProblemDraft } from "@/server/ai/schemas";
import type { GenerateLine } from "@/shared/problem";
import { type PipelineInput, type RejectReason, runPipeline } from "./pipeline";

const analysis: MistakeAnalysis = {
  subject: "math",
  unit: "分数のたし算",
  question: "1/2 + 1/3 = ?",
  childAnswer: "2/5",
  correctAnswer: "5/6",
  mistakeTypeId: "math.fraction.add-denominators",
  explanation: "分母どうしも足している",
  confidence: { question: 1, childAnswer: 1, correctAnswer: 1 },
  piiDetected: false,
  gradingMarksFound: false,
};

const input: PipelineInput = {
  analysis,
  grade: "e5",
  mode: "first",
  avoid: [],
};

const usage = { model: "fake", inputTokens: 1, outputTokens: 1, retries: 0 };

const p = (over: Partial<ProblemDraft>): ProblemDraft => ({
  role: "same-type",
  prompt: "1/3 + 1/4 = ?",
  format: { kind: "numeric" },
  answer: "7/12",
  hints: ["分母をそろえよう"],
  explanation: "4/12 + 3/12",
  ...over,
});

/**
 * 呼ばれるたびに、決めた問題を返す偽物の AI。
 * rounds[i] は i 回目の生成で返す問題。solve は answers の答えを返す（なければ作った答え）。
 */
function fake(opts: {
  rounds: ProblemDraft[][];
  answers?: Record<string, string>;
  inappropriate?: string[];
  solveThrows?: boolean;
  generateThrows?: unknown;
}): AIProvider & { requests: GenerateInput[] } {
  const requests: GenerateInput[] = [];
  let round = 0;
  const base = createMockProvider();
  const answerOf = new Map(
    opts.rounds.flat().map((q) => [q.prompt, q.answer] as const),
  );
  return {
    ...base,
    requests,
    async *generateCounterProblems(req) {
      requests.push(req);
      if (opts.generateThrows) throw opts.generateThrows;
      for (const q of opts.rounds[round++] ?? []) yield { value: q, usage };
    },
    async solve({ problem }) {
      if (opts.solveThrows) throw new Error("boom");
      return {
        value: {
          answer:
            opts.answers?.[problem.prompt] ??
            answerOf.get(problem.prompt) ??
            "",
          appropriate: !opts.inappropriate?.includes(problem.prompt),
        },
        usage: { ...usage, model: "fake-verifier" },
      };
    },
  };
}

async function run(
  provider: AIProvider,
  i: PipelineInput = input,
  signal?: AbortSignal,
) {
  const lines: GenerateLine[] = [];
  const reasons: RejectReason[] = [];
  for await (const line of runPipeline(
    provider,
    i,
    { requestId: "r", signal },
    { onReject: (r) => reasons.push(r) },
  ))
    lines.push(line);
  const problems = lines.flatMap((l) => ("problem" in l ? [l.problem] : []));
  const done = lines.find((l) => "done" in l);
  return {
    problems,
    reasons,
    meta: done && "done" in done ? done.meta : undefined,
  };
}

const choice = p({
  role: "focus",
  prompt: "1/2 と 1/3 を通分すると、分母は？",
  format: { kind: "choice", options: ["5", "6", "8"] },
  answer: "6",
});
const stretch = p({ role: "stretch", prompt: "2/3 + 1/6 = ?", answer: "5/6" });

describe("問題の生成と検証（BR-45-2）", () => {
  it("偽物の AI で、初回は3問、すべて検証の記録つき", async () => {
    const { problems, meta } = await run(createMockProvider());
    expect(problems.map((q) => q.role)).toEqual([
      "same-type",
      "focus",
      "stretch",
    ]);
    expect(problems.map((q) => q.verification.method)).toEqual([
      "arith",
      "solver",
      "arith",
    ]);
    expect(problems[0].verification).toMatchObject({
      regenerations: 0,
      promptVersion: "generate@2",
      verifierPromptVersion: "solve@2",
      provider: "mock",
      model: "mock-generate",
      verifierModel: "mock-verify",
    });
    expect(meta).toMatchObject({
      verified: 3,
      rejected: 0,
      regenerated: false,
    });
  });

  it("再来は2問で、前の問題を避ける", async () => {
    const { problems } = await run(createMockProvider(), {
      ...input,
      mode: "revisit",
      avoid: ["1/5 + 1/2 = ?", "2/3 + 1/6 = ?"],
    });
    expect(problems.map((q) => q.prompt)).toEqual([
      "1/3 + 1/4 = ?",
      "1/4 + 1/6 = ?",
    ]);
  });

  it("検算が合わない問題は出さず、足りない役割だけを1回作り直す", async () => {
    const wrong = p({ answer: "2/7" });
    const f = fake({
      rounds: [
        [wrong, choice, stretch],
        [p({ prompt: "1/5 + 1/2 = ?", answer: "7/10" })],
      ],
    });
    const { problems, reasons, meta } = await run(f);
    expect(reasons).toEqual(["arith_mismatch"]);
    expect(problems.map((q) => q.prompt)).toEqual([
      "1/2 と 1/3 を通分すると、分母は？",
      "2/3 + 1/6 = ?",
      "1/5 + 1/2 = ?",
    ]);
    expect(problems[2].verification.regenerations).toBe(1);
    expect(f.requests[1].roles).toEqual(["same-type"]);
    // 作り直しのときは、前に作った問題を避ける
    expect(f.requests[1].avoid).toContain("1/3 + 1/4 = ?");
    expect(meta).toMatchObject({ verified: 3, rejected: 1, regenerated: true });
  });

  it("作り直しても足りなければ、通った数で終える（2問なら戦える）", async () => {
    const f = fake({
      rounds: [[p({ answer: "1" }), choice, stretch], [p({ answer: "2" })]],
    });
    const { problems, meta } = await run(f);
    expect(problems).toHaveLength(2);
    expect(f.requests).toHaveLength(2);
    expect(meta).toMatchObject({ verified: 2, rejected: 2 });
  });

  it("検証役の答えが違う問題は出さない。選択肢に正解が1つだけかも確かめる", async () => {
    const twoCorrect = p({
      role: "focus",
      prompt: "どれ？",
      format: { kind: "choice", options: ["6", "６", "8"] },
      answer: "6",
    });
    const f = fake({
      rounds: [[p({}), choice, twoCorrect], []],
      answers: { "1/2 と 1/3 を通分すると、分母は？": "8" },
    });
    const { problems, reasons } = await run(f);
    expect(problems).toHaveLength(1);
    expect(reasons.sort()).toEqual(["invalid_shape", "solver_mismatch"]);
  });

  it("子ども向けでない、または出さない言葉・個人情報らしい文字がある問題は出さない", async () => {
    const bad = p({
      role: "focus",
      prompt: "死ね と言われたら？",
      format: { kind: "text", acceptable: ["x"] },
      answer: "x",
    });
    const pii = p({
      role: "stretch",
      prompt: "03-1234-5678 は何？",
      format: { kind: "text", acceptable: ["y"] },
      answer: "y",
    });
    const f = fake({
      rounds: [[p({}), bad, pii], [{ ...choice, prompt: "Q?" }]],
      inappropriate: ["Q?"],
    });
    const { problems, reasons } = await run(f);
    expect(problems).toHaveLength(1);
    expect(reasons).toEqual(["blocked_word", "pii", "inappropriate"]);
  });

  it("計算で確かめた問題でも、適切かどうかは検証役に聞く", async () => {
    const f = fake({
      rounds: [[p({}), choice, stretch]],
      inappropriate: ["1/3 + 1/4 = ?"],
    });
    const { reasons } = await run(f);
    expect(reasons[0]).toBe("inappropriate");
  });

  it("条件（約分して）に合わない答えの問題は出さない", async () => {
    const f = fake({
      rounds: [
        [
          p({
            format: { kind: "numeric", condition: "reduced" },
            answer: "6/12",
          }),
          choice,
          stretch,
        ],
        [],
      ],
    });
    const { reasons } = await run(f);
    expect(reasons).toContain("invalid_shape");
  });

  it("並べ替え・短い文・自己採点も検証役と比べる", async () => {
    const ordering = p({
      role: "same-type",
      prompt: "ならべかえ",
      format: { kind: "ordering", tokens: ["goes", "He", "school", "to"] },
      answer: "He goes to school.",
    });
    const badOrdering = p({
      ...ordering,
      prompt: "x",
      format: { kind: "ordering", tokens: ["He"] },
    });
    const text = p({
      role: "focus",
      prompt: "光合成は？",
      format: { kind: "text", acceptable: ["こうごうせい"] },
      answer: "光合成",
    });
    const self = p({
      role: "stretch",
      prompt: "「植」を書こう",
      format: { kind: "self-check", model: "植" },
      answer: "植",
    });
    const f = fake({
      rounds: [[ordering, text, self, badOrdering]],
      answers: {
        光合成は: "x",
        "光合成は？": "コウゴウセイ",
        ならべかえ: "He goes to school",
      },
    });
    const { problems, reasons } = await run(f);
    expect(problems.map((q) => q.prompt)).toEqual([
      "ならべかえ",
      "光合成は？",
      "「植」を書こう",
    ]);
    expect(reasons).toEqual(["invalid_shape"]);
  });

  it("検証役の呼び出しが失敗した問題は出さない（検証していない問題は出さない）", async () => {
    const f = fake({
      rounds: [[p({}), choice, stretch], []],
      solveThrows: true,
    });
    const { problems, reasons, meta } = await run(f);
    expect(problems).toHaveLength(0);
    expect(reasons).toEqual(["solver_error", "solver_error", "solver_error"]);
    expect(meta?.verified).toBe(0);
  });

  it("答えが空の問題は出さない", async () => {
    const f = fake({ rounds: [[p({ answer: " " })], []] });
    expect((await run(f)).reasons).toEqual(["invalid_shape"]);
  });

  it("生成が失敗して1問もなければ、エラーを投げる", async () => {
    const err = Object.assign(new Error("x"), { name: "InvalidOutputError" });
    const f = fake({ rounds: [], generateThrows: err });
    await expect(run(f)).rejects.toBe(err);
    expect(f.requests).toHaveLength(2);
  });

  it("時間切れなら、そこまでの問題で終え、timedOut を知らせる", async () => {
    const ctrl = new AbortController();
    const base = createMockProvider();
    const slow: AIProvider = {
      ...base,
      async solve(req, ctx) {
        if (req.problem.role === "focus") {
          ctrl.abort();
          throw Object.assign(new Error("t"), { name: "AbortError" });
        }
        return base.solve(req, ctx);
      },
    };
    const { problems, meta } = await run(slow, input, ctrl.signal);
    expect(problems).toHaveLength(1);
    expect(meta).toMatchObject({ verified: 1, timedOut: true });
  });
});
