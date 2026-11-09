import type { AIProvider, Usage } from "../../provider";
import type { MistakeAnalysis, ProblemDraft, Subject } from "../../schemas";

/**
 * 決まった答えを返す、開発・テスト用の AI（偽物の AI）。
 * キーなしで全機能が動く。CI と E2E テストはこれを使う。
 */

const usage = (model: string): Usage => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  retries: 0,
});

const ANALYSES: Record<Subject, MistakeAnalysis> = {
  math: {
    subject: "math",
    unit: "分数のたし算",
    question: "1/2 + 1/3 = ?",
    childAnswer: "2/5",
    correctAnswer: "5/6",
    mistakeTypeId: "math.fraction.add-denominators",
    explanation:
      "分母どうしも足してしまっています。通分してから分子を足します。",
    confidence: { question: 0.95, childAnswer: 0.9, correctAnswer: 0.95 },
    piiDetected: false,
    gradingMarksFound: true,
  },
  english: {
    subject: "english",
    unit: "三人称単数現在",
    question: "He ( ) to school every day. (go)",
    childAnswer: "go",
    correctAnswer: "goes",
    mistakeTypeId: "english.verb.third-person-s",
    explanation: "主語が He なので、動詞に s（es）が付きます。",
    confidence: { question: 0.9, childAnswer: 0.9, correctAnswer: 0.9 },
    piiDetected: false,
    gradingMarksFound: true,
  },
  japanese: {
    subject: "japanese",
    unit: "漢字の読み",
    question: "「植物」の読みを書きましょう。",
    childAnswer: "しょくぶち",
    correctAnswer: "しょくぶつ",
    mistakeTypeId: "japanese.kanji.reading",
    explanation: "「物」の読みを「ぶち」と書いています。正しくは「ぶつ」です。",
    confidence: { question: 0.9, childAnswer: 0.85, correctAnswer: 0.9 },
    piiDetected: false,
    gradingMarksFound: true,
  },
  science: {
    subject: "science",
    unit: "植物のつくり",
    question: "植物が日光を受けてでんぷんをつくるはたらきを何といいますか。",
    childAnswer: "呼吸",
    correctAnswer: "光合成",
    mistakeTypeId: "science.term.confusion",
    explanation: "「呼吸」と「光合成」を取り違えています。",
    confidence: { question: 0.9, childAnswer: 0.9, correctAnswer: 0.9 },
    piiDetected: false,
    gradingMarksFound: true,
  },
  social: {
    subject: "social",
    unit: "日本の地理",
    question: "日本でいちばん長い川は何ですか。",
    childAnswer: "利根川",
    correctAnswer: "信濃川",
    mistakeTypeId: "social.term.confusion",
    explanation: "長さの順番を取り違えています。",
    confidence: { question: 0.9, childAnswer: 0.9, correctAnswer: 0.9 },
    piiDetected: false,
    gradingMarksFound: true,
  },
};

const PROBLEMS: ProblemDraft[] = [
  {
    role: "same-type",
    prompt: "1/3 + 1/4 = ?",
    format: { kind: "numeric" },
    answer: "7/12",
    hints: ["まず分母をそろえよう", "3 と 4 の最小公倍数は 12"],
    explanation: "4/12 + 3/12 = 7/12",
  },
  {
    role: "focus",
    prompt: "1/2 と 1/3 を通分すると、分母はいくつになりますか。",
    format: { kind: "choice", options: ["5", "6", "8"] },
    answer: "6",
    hints: ["2 と 3 の両方でわれる数", "最小公倍数をさがそう"],
    explanation: "2 と 3 の最小公倍数は 6 です。",
  },
  {
    role: "stretch",
    prompt: "2/3 + 1/6 = ?",
    format: { kind: "numeric" },
    answer: "5/6",
    hints: ["6 にそろえよう", "2/3 = 4/6"],
    explanation: "4/6 + 1/6 = 5/6",
  },
  {
    role: "stretch",
    prompt: "1/4 + 1/6 = ?",
    format: { kind: "numeric" },
    answer: "5/12",
    hints: ["12 にそろえよう", "3/12 + 2/12"],
    explanation: "3/12 + 2/12 = 5/12",
  },
  {
    role: "stretch",
    prompt: "3/5 + 1/10 = ?",
    format: { kind: "numeric" },
    answer: "7/10",
    hints: ["10 にそろえよう", "3/5 = 6/10"],
    explanation: "6/10 + 1/10 = 7/10",
  },
];

const answerOf = new Map(PROBLEMS.map((p) => [p.prompt, p.answer]));

const normalize = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

export function createMockProvider(): AIProvider {
  return {
    name: "mock",

    async analyzeMistake(input) {
      return {
        value: ANALYSES[input.subjectHint ?? "math"],
        usage: usage("mock-analyze"),
      };
    },

    async *generateCounterProblems(input) {
      const avoid = new Set(input.avoid);
      const pool = PROBLEMS.filter((p) => !avoid.has(p.prompt));
      for (const problem of pool.slice(0, input.count)) {
        yield { value: problem, usage: usage("mock-generate") };
      }
    },

    async solve(input) {
      return {
        value: { answer: answerOf.get(input.problem.prompt) ?? "" },
        usage: usage("mock-verify"),
      };
    },

    async gradeFreeText(input) {
      const correct =
        normalize(input.answer) === normalize(input.problem.answer);
      return {
        value: {
          correct,
          feedback: correct ? "せいかい！" : "おしい！もう一回かんがえてみよう",
        },
        usage: usage("mock-grade"),
      };
    },
  };
}
