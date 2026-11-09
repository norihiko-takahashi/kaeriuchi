import "server-only";
import {
  BedrockRuntimeClient,
  type ContentBlock,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { z } from "zod";
import type { BedrockModels } from "@/server/config";
import {
  analyzePrompt,
  generatePrompt,
  gradePrompt,
  type Prompt,
  solvePrompt,
} from "../../prompts";
import type {
  AIProvider,
  AiRole,
  CallContext,
  WithUsage,
} from "../../provider";
import {
  GradeResult,
  MistakeAnalysis,
  ProblemDrafts,
  SolveResult,
} from "../../schemas";

/**
 * Amazon Bedrock（Claude）のプロバイダー。
 * AWS の SDK を使ってよいのは、このディレクトリの中だけ（U2-PORT-1）。
 * 認証情報は AWS の標準の仕組み（AWS_PROFILE、SSO、実行環境のロール）から読む（U2-SEC-1）。
 */

const MAX_TOKENS: Record<AiRole, number> = {
  analyze: 1200,
  generate: 3000,
  verify: 300,
  grade: 300,
};

/** やり直しの回数（スキーマの検証の失敗と、一時的なエラー。BR-U2-3） */
const MAX_RETRIES = 2;
const RETRYABLE = new Set([
  "ThrottlingException",
  "ServiceUnavailableException",
  "InternalServerException",
  "ModelNotReadyException",
]);

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOutputError";
  }
}

export interface BedrockProviderOptions {
  region: string;
  profile?: string;
  models: BedrockModels;
  /** テスト用：SDK のクライアントを差し替える */
  client?: BedrockRuntimeClient;
  /** テスト用：待ち時間を短くする */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number): number {
  // 0.5秒、1秒…に、ゆらぎを付ける（U2-PERF-3）
  const base = 500 * 2 ** attempt;
  return base / 2 + Math.random() * (base / 2);
}

export function createBedrockProvider(
  opts: BedrockProviderOptions,
): AIProvider {
  const client =
    opts.client ??
    new BedrockRuntimeClient({
      region: opts.region,
      credentials: fromNodeProviderChain(
        opts.profile ? { profile: opts.profile } : {},
      ),
      maxAttempts: 1, // やり直しは自分で行う（スキーマの失敗もまとめて数えるため）
    });
  const sleep = opts.sleep ?? defaultSleep;

  async function callTool<I, S extends z.ZodType>(
    role: AiRole,
    prompt: Prompt<I>,
    input: I,
    schema: S,
    ctx: CallContext,
    image?: { mime: "image/jpeg" | "image/png"; data: Uint8Array },
  ): Promise<WithUsage<z.infer<S>>> {
    const modelId = opts.models[role];
    const content: ContentBlock[] = [];
    if (image) {
      content.push({
        image: {
          format: image.mime === "image/png" ? "png" : "jpeg",
          source: { bytes: image.data },
        },
      });
    }
    content.push({ text: prompt.user(input) });

    let inputTokens = 0;
    let outputTokens = 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(backoffMs(attempt - 1));
      let res: ConverseCommandOutput;
      try {
        res = await client.send(
          new ConverseCommand({
            modelId,
            system: [{ text: prompt.system }],
            messages: [{ role: "user", content }],
            inferenceConfig: { maxTokens: MAX_TOKENS[role], temperature: 0.2 },
            toolConfig: {
              tools: [
                {
                  toolSpec: {
                    name: "submit",
                    description: "結果を返す",
                    inputSchema: {
                      json: z.toJSONSchema(schema, {
                        target: "draft-7",
                      }) as never,
                    },
                  },
                },
              ],
              toolChoice: { tool: { name: "submit" } },
            },
            // 呼び出しの記録と、アプリのログを突き合わせるため（中身はアプリのログに出さない）
            requestMetadata: {
              requestId: ctx.requestId,
              promptVersion: prompt.id,
            },
          }),
          { abortSignal: ctx.signal },
        );
      } catch (e) {
        lastError = e;
        const name = (e as { name?: string }).name ?? "";
        if (RETRYABLE.has(name) && attempt < MAX_RETRIES) continue;
        throw e;
      }

      inputTokens += res.usage?.inputTokens ?? 0;
      outputTokens += res.usage?.outputTokens ?? 0;
      const toolUse = res.output?.message?.content?.find(
        (c) => c.toolUse,
      )?.toolUse;
      const parsed = schema.safeParse(toolUse?.input);
      if (parsed.success) {
        return {
          value: parsed.data,
          usage: {
            model: modelId,
            inputTokens,
            outputTokens,
            retries: attempt,
          },
        };
      }
      lastError = new InvalidOutputError(
        `AI の出力がスキーマに合いません（${prompt.id}）`,
      );
    }
    throw lastError;
  }

  return {
    name: "bedrock",

    analyzeMistake(input, ctx) {
      return callTool(
        "analyze",
        analyzePrompt,
        {
          grade: input.grade,
          subjectHint: input.subjectHint,
          catalog: input.mistakeTypeCatalog,
        },
        MistakeAnalysis,
        ctx,
        input.image,
      );
    },

    async *generateCounterProblems(input, ctx) {
      // U2 では1回の呼び出しでまとめて作り、1問ずつ返す。
      // 1問目を早く出すためのストリーミング（ConverseStream）は、U4 で入れる
      const { value, usage } = await callTool(
        "generate",
        generatePrompt,
        input,
        ProblemDrafts,
        ctx,
      );
      for (const [i, problem] of value.problems
        .slice(0, input.count)
        .entries()) {
        yield {
          value: problem,
          usage:
            i === 0 ? usage : { ...usage, inputTokens: 0, outputTokens: 0 },
        };
      }
    },

    solve(input, ctx) {
      return callTool("verify", solvePrompt, input, SolveResult, ctx);
    },

    gradeFreeText(input, ctx) {
      return callTool("grade", gradePrompt, input, GradeResult, ctx);
    },
  };
}
