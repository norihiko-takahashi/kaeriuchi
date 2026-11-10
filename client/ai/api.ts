import type { Grade } from "@/shared/constants";
import type {
  ClassifyResult,
  GenerateLine,
  ProblemDraft,
  Subject,
  VerifiedProblem,
} from "@/shared/problem";
import { getDB } from "../store/db";

/**
 * AI の API を呼ぶ（画面から）。
 * 端末の ID は、1日の回数の制限に使うだけのランダムな値（子どもやプロフィールとは結びつけない）。
 */

const DEVICE_KEY = "device-id";

export async function deviceId(): Promise<string> {
  const db = getDB();
  const row = await db.meta.get(DEVICE_KEY);
  if (typeof row?.value === "string") return row.value;
  const id = crypto.randomUUID();
  await db.meta.put({ key: DEVICE_KEY, value: id });
  return id;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    /** 子どもに見せてよい文（サーバーが決めたもの） */
    readonly childMessage: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const OFFLINE = new ApiError(
  "offline",
  "インターネットに つながっていないよ。つながってから ためしてね",
);

async function post(path: string, body: unknown, signal?: AbortSignal) {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw OFFLINE;
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": await deviceId(),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw OFFLINE;
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(
      json?.error?.code ?? "error",
      json?.error?.message ?? "うまく いかなかったよ。もう一回 ためしてね",
    );
  }
  return res;
}

export interface ClassifyResponse {
  result: ClassifyResult;
  meta: { provider: string; model: string; promptVersion: string };
}

export async function classify(input: {
  subject: Subject;
  grade: Grade;
  question: string;
  childAnswer: string;
  correctAnswer: string;
}): Promise<ClassifyResponse> {
  return (await post("/api/ai/classify", input)).json();
}

export interface GenerateDone {
  verified: number;
  timedOut: boolean;
}

/**
 * 問題を作ってもらい、検証に通った問題を1問ずつ受け取る（NDJSON）。
 * 途中で通信が切れたら、そこまでに届いた数で終える。
 */
export async function generate(
  input: {
    analysis: unknown;
    grade: Grade;
    mode: "first" | "revisit";
    avoid: string[];
  },
  onProblem: (p: VerifiedProblem) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<GenerateDone> {
  const res = await post("/api/ai/generate", input, signal);
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError("error", "うまく いかなかったよ");
  const decoder = new TextDecoder();
  let buffer = "";
  let received = 0;
  const handle = async (raw: string): Promise<GenerateDone | undefined> => {
    if (!raw.trim()) return;
    const line = JSON.parse(raw) as GenerateLine;
    if ("problem" in line) {
      received++;
      await onProblem(line.problem);
    } else if ("done" in line) {
      return { verified: line.meta.verified, timedOut: line.meta.timedOut };
    } else if ("error" in line && received === 0) {
      throw new ApiError(line.error.code, "うまく つくれなかったよ");
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const result = await handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (result) return result;
        nl = buffer.indexOf("\n");
      }
    }
    const result = await handle(buffer);
    if (result) return result;
  } catch (e) {
    if (e instanceof ApiError || (e as Error).name === "AbortError") throw e;
  }
  // 最後の行が届かなかった（通信が切れた）
  return { verified: received, timedOut: false };
}

/** 短い文の答えを AI で採点する（一覧で判断できないときだけ・BR-45-7） */
export async function gradeFreeText(input: {
  problem: ProblemDraft;
  answer: string;
  grade: Grade;
}): Promise<boolean> {
  const json = await (await post("/api/ai/grade", input)).json();
  return json.result.correct === true;
}
