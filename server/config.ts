import { z } from "zod";

/** 処理するリージョンは東京だけ（U2-PRIV-4・BR-U2-2） */
export const ALLOWED_AI_REGION = "ap-northeast-1";

/**
 * リージョンをまたぐ推論のプロファイル（"apac." "global." などで始まる ID）は使わない。
 * 国外で処理されることがあるため（BR-U2-2）。
 */
const CROSS_REGION_PREFIX = /^(us|eu|apac|jp|global|au|ca)\./i;

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const Env = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /** 本番の環境かどうか。ビルドの NODE_ENV とは別に、公開する環境で "production" にする */
  APP_ENV: z
    .enum(["local", "ci", "preview", "staging", "production"])
    .default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["mock", "bedrock", "anthropic"]).default("mock"),
  SYNC_STORE: z.enum(["memory", "postgres", "dynamo"]).default("memory"),
  AUTH_PROVIDER: z
    .enum(["dev", "authjs", "cognito", "supabase"])
    .default("dev"),

  /* ---------- AWS・Bedrock（AI_PROVIDER=bedrock のとき） ---------- */
  /** 社用・個人用の切り替え（~/.aws/config のプロファイル名）。認証情報そのものは書かない */
  AWS_PROFILE: optionalString,
  AWS_REGION: z.string().default(ALLOWED_AI_REGION),
  BEDROCK_MODEL_ANALYZE: optionalString,
  BEDROCK_MODEL_GENERATE: optionalString,
  BEDROCK_MODEL_VERIFY: optionalString,
  BEDROCK_MODEL_GRADE: optionalString,
  /** 呼び出しの記録の保存期間の上限（日）。これより長ければ警告する */
  BEDROCK_LOG_RETENTION_MAX_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
});

export type Config = z.infer<typeof Env>;

export interface BedrockModels {
  analyze: string;
  generate: string;
  verify: string;
  grade: string;
}

/**
 * 設定を読み、中身をチェックする（U1-PORT-3）。
 * 本番の環境で開発用の設定のままなら、エラーにする（nfr-design.md §5）。
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const config = Env.parse(env);
  if (config.APP_ENV === "production") {
    const devOnly: string[] = [];
    if (config.AI_PROVIDER === "mock") devOnly.push("AI_PROVIDER=mock");
    if (config.SYNC_STORE === "memory") devOnly.push("SYNC_STORE=memory");
    if (config.AUTH_PROVIDER === "dev") devOnly.push("AUTH_PROVIDER=dev");
    if (devOnly.length > 0) {
      throw new Error(
        `本番の環境で開発用の設定が使われています: ${devOnly.join(", ")}`,
      );
    }
  }
  if (config.AI_PROVIDER === "bedrock") bedrockModels(config);
  return config;
}

/** Bedrock の設定を確かめて、役割ごとのモデル ID を返す */
export function bedrockModels(config: Config): BedrockModels {
  if (config.AWS_REGION !== ALLOWED_AI_REGION) {
    throw new Error(
      `AI の処理は東京リージョン（${ALLOWED_AI_REGION}）だけで行います: AWS_REGION=${config.AWS_REGION}`,
    );
  }
  const models = {
    analyze: config.BEDROCK_MODEL_ANALYZE,
    generate: config.BEDROCK_MODEL_GENERATE,
    verify: config.BEDROCK_MODEL_VERIFY,
    grade: config.BEDROCK_MODEL_GRADE,
  };
  const missing = Object.entries(models)
    .filter(([, id]) => !id)
    .map(([role]) => `BEDROCK_MODEL_${role.toUpperCase()}`);
  if (missing.length > 0) {
    throw new Error(`Bedrock のモデル ID が足りません: ${missing.join(", ")}`);
  }
  const crossRegion = Object.values(models).filter((id) =>
    CROSS_REGION_PREFIX.test(id ?? ""),
  );
  if (crossRegion.length > 0) {
    throw new Error(
      `リージョンをまたぐ推論のプロファイルは使いません（国外で処理されることがあるため）: ${crossRegion.join(", ")}`,
    );
  }
  return models as BedrockModels;
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}

/** テスト用 */
export function resetConfigForTesting() {
  cached = undefined;
}
