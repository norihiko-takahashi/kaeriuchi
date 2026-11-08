import { z } from "zod";

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
});

export type Config = z.infer<typeof Env>;

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
  return config;
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
