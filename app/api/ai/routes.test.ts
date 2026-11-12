import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockProvider } from "@/server/ai/providers/mock/index";
import { resetRegistryForTesting } from "@/server/ai/registry";
import { resetConfigForTesting } from "@/server/config";
import { POST as analyze } from "./analyze/route";
import { POST as classify } from "./classify/route";
import { POST as generate } from "./generate/route";
import { POST as grade } from "./grade/route";

/** 偽物の AI（Mock）で、API の入り口から最後まで動かす */

function tinyJpeg(extra: number[] = []) {
  const seg = (m: number, p: number[]) => [
    0xff,
    m,
    (p.length + 2) >> 8,
    (p.length + 2) & 0xff,
    ...p,
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...extra,
    ...seg(0xc0, [8, 0, 10, 0, 10, 1, 1, 0x11, 0]),
    0xff,
    0xda,
    0,
    8,
    1,
    1,
    0,
    0,
    0x3f,
    0,
    0,
    0xff,
    0xd9,
  ]);
}

let device = 0;
const headers = () => ({
  "x-device-id": `test-device-${String(++device).padStart(4, "0")}`,
});

function analyzeRequest(image: Uint8Array, gradeValue = "e5") {
  const form = new FormData();
  form.set(
    "image",
    new Blob([image as BlobPart], { type: "image/jpeg" }),
    "x.jpg",
  );
  form.set("grade", gradeValue);
  form.set("subject", "math");
  return new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    body: form,
    headers: headers(),
  });
}

beforeEach(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.APP_ENV = "ci";
  resetConfigForTesting();
  resetRegistryForTesting();
});
afterEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.APP_ENV;
  resetConfigForTesting();
});

describe("POST /api/ai/analyze", () => {
  it("画像を解析して、結果とプロンプトの版を返す", async () => {
    const res = await analyze(analyzeRequest(tinyJpeg()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis.correctAnswer).toBe("5/6");
    expect(body.meta).toMatchObject({
      provider: "mock",
      promptVersion: "analyze@1",
    });
  });

  it("位置情報などのメタデータが残った画像は受け付けない", async () => {
    const exif = [0xff, 0xe1, 0, 6, 0x45, 0x78, 0x69, 0x66];
    const res = await analyze(analyzeRequest(tinyJpeg(exif)));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("image_metadata");
  });

  it("学年が正しくなければ 400", async () => {
    const res = await analyze(analyzeRequest(tinyJpeg(), "x9"));
    expect(res.status).toBe(400);
  });

  it("フォームでなければ 400", async () => {
    const res = await analyze(
      new Request("http://localhost/api/ai/analyze", {
        method: "POST",
        body: "x",
        headers: headers(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("本番の環境では動かさない", async () => {
    process.env.APP_ENV = "production";
    process.env.SYNC_STORE = "postgres";
    process.env.AUTH_PROVIDER = "authjs";
    process.env.AI_PROVIDER = "anthropic";
    process.env.APP_URL = "https://example.jp";
    resetConfigForTesting();
    const res = await analyze(analyzeRequest(tinyJpeg()));
    expect(res.status).toBe(503);
    for (const k of ["SYNC_STORE", "AUTH_PROVIDER", "APP_URL"])
      delete process.env[k];
  });
});

const analysis = {
  subject: "math",
  unit: "分数のたし算",
  question: "1/2 + 1/3 = ?",
  childAnswer: "2/5",
  correctAnswer: "5/6",
  mistakeTypeId: "math.fraction.add-denominators",
  explanation: "x",
  confidence: { question: 0.9, childAnswer: 0.9, correctAnswer: 0.9 },
  piiDetected: false,
  gradingMarksFound: true,
};

describe("POST /api/ai/generate", () => {
  it("検証に通った問題を NDJSON で1問ずつ返し、最後に done を返す", async () => {
    const res = await generate(
      new Request("http://localhost/api/ai/generate", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ analysis, grade: "e5" }),
      }),
    );
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const problems = lines.filter((l) => l.problem).map((l) => l.problem);
    expect(problems).toHaveLength(3);
    for (const p of problems)
      expect(p.verification).toMatchObject({
        promptVersion: "generate@3",
        verifierPromptVersion: "solve@2",
        provider: "mock",
      });
    expect(lines.at(-1)).toMatchObject({
      done: true,
      meta: { verified: 3, rejected: 0, timedOut: false },
    });
  });

  it("再来は2問", async () => {
    const res = await generate(
      new Request("http://localhost/api/ai/generate", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ analysis, grade: "e5", mode: "revisit" }),
      }),
    );
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.filter((l) => l.problem)).toHaveLength(2);
  });

  it("入力が正しくなければ 400", async () => {
    const res = await generate(
      new Request("http://localhost/api/ai/generate", {
        method: "POST",
        headers: headers(),
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/grade", () => {
  it("短い文の答えを採点する", async () => {
    const res = await grade(
      new Request("http://localhost/api/ai/grade", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          problem: {
            role: "focus",
            prompt: "日本でいちばん長い川は？",
            format: { kind: "text", acceptable: ["信濃川"] },
            answer: "信濃川",
            hints: ["新潟県"],
            explanation: "x",
          },
          answer: "信濃川",
          grade: "e5",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).result.correct).toBe(true);
  });

  it("入力が正しくなければ 400", async () => {
    const res = await grade(
      new Request("http://localhost/api/ai/grade", {
        method: "POST",
        headers: headers(),
        body: "null",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/classify", () => {
  const body = {
    subject: "math",
    grade: "e5",
    question: "1/2 + 1/3 = ?",
    childAnswer: "2/5",
    correctAnswer: "5/6",
  };

  it("手で入れた間違いの、間違いのタイプを返す", async () => {
    const res = await classify(
      new Request("http://localhost/api/ai/classify", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.mistakeTypeId).toBe("math.fraction.add-denominators");
    expect(json.meta).toMatchObject({
      provider: "mock",
      promptVersion: "classify@1",
    });
  });

  it("一覧にないタイプが返ってきたら other にする", async () => {
    const mock = createMockProvider();
    resetRegistryForTesting({
      ...mock,
      classifyMistake: async (input, ctx) => {
        const r = await mock.classifyMistake(input, ctx);
        return { ...r, value: { ...r.value, mistakeTypeId: "made.up" } };
      },
    });
    const res = await classify(
      new Request("http://localhost/api/ai/classify", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      }),
    );
    expect((await res.json()).result.mistakeTypeId).toBe("other");
  });

  it("AI が失敗したら、中の詳細を出さずにエラーを返す", async () => {
    const mock = createMockProvider();
    resetRegistryForTesting({
      ...mock,
      classifyMistake: async () => {
        throw Object.assign(new Error("secret"), {
          name: "InvalidOutputError",
        });
      },
    });
    const res = await classify(
      new Request("http://localhost/api/ai/classify", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("secret");
  });

  it.each([
    ["問題文がない", { ...body, question: " " }],
    ["問題文が200字を超える", { ...body, question: "あ".repeat(201) }],
    ["答えが100字を超える", { ...body, childAnswer: "1".repeat(101) }],
    ["教科がない", { ...body, subject: undefined }],
  ])("%s なら 400", async (_name, b) => {
    const res = await classify(
      new Request("http://localhost/api/ai/classify", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(b),
      }),
    );
    expect(res.status).toBe(400);
  });
});
