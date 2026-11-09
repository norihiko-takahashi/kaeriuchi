import "server-only";
import { bedrockModels, type Config } from "@/server/config";
import type { AIProvider } from "./provider";
import {
  type AccountStatus,
  createAccountClients,
  loggingBlocksAi,
  readAccountStatus,
} from "./providers/bedrock/account";
import { createBedrockProvider } from "./providers/bedrock/index";
import { createMockProvider } from "./providers/mock/index";

/**
 * 設定に合わせて、AI のプロバイダーを選ぶ。
 * Bedrock のときは、呼び出しの記録の設定を確かめ、画像が記録される設定なら止める（U2-PRIV-3）。
 */

let provider: AIProvider | undefined;
let accountCache:
  | { at: number; status?: AccountStatus; error?: string }
  | undefined;
const ACCOUNT_TTL_MS = 5 * 60_000;

export function getProvider(config: Config): AIProvider {
  if (provider) return provider;
  switch (config.AI_PROVIDER) {
    case "mock":
      provider = createMockProvider();
      break;
    case "bedrock":
      provider = createBedrockProvider({
        region: config.AWS_REGION,
        profile: config.AWS_PROFILE,
        models: bedrockModels(config),
      });
      break;
    default:
      throw new Error(
        `まだ使えない AI のプロバイダーです: ${config.AI_PROVIDER}`,
      );
  }
  return provider;
}

/** つながっているアカウントの状態（5分ごとに読み直す） */
export async function getAccountStatus(
  config: Config,
): Promise<{ status?: AccountStatus; error?: string }> {
  if (config.AI_PROVIDER !== "bedrock") return {};
  if (accountCache && Date.now() - accountCache.at < ACCOUNT_TTL_MS)
    return accountCache;
  try {
    const status = await readAccountStatus(
      createAccountClients(config.AWS_REGION, config.AWS_PROFILE),
      config.AWS_REGION,
    );
    accountCache = { at: Date.now(), status };
  } catch (e) {
    accountCache = {
      at: Date.now(),
      error: `AWS のアカウントの状態を読めませんでした（${(e as Error).name}）`,
    };
  }
  return accountCache;
}

/**
 * AI の API を動かしてよいか。
 * Bedrock で、呼び出しの記録の設定が読めないとき、または画像が記録される設定のときは動かさない。
 */
export async function aiAllowed(config: Config): Promise<boolean> {
  if (config.AI_PROVIDER !== "bedrock") return true;
  const { status } = await getAccountStatus(config);
  if (!status) return false;
  return !loggingBlocksAi(status.logging);
}

/** テスト用 */
export function resetRegistryForTesting(p?: AIProvider) {
  provider = p;
  accountCache = undefined;
}
