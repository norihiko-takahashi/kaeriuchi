import { createSerwistRoute } from "@serwist/turbopack";

/**
 * オフラインでも開けるようにする画面。
 * 画面はリクエストのたびにサーバーで描画される（CSP の nonce のため）ので、
 * Service Worker を入れたときにサーバーから取得してキャッシュする。
 * キャッシュには、その画面の CSP のヘッダーも一緒に保存される（nonce が合う）。
 */
const APP_ROUTES = [
  "/",
  "/login",
  "/consent",
  "/parent/pin-setup",
  "/profiles",
  "/profiles/new",
  "/profiles/new/nickname-guide",
  "/profiles/new/nickname",
  "/install",
  "/home",
  "/parent",
  "/parent/unlock",
  "/parent/rules",
  "/parent/data",
  "/parent/reports",
  "/parent/insights",
  "/parent/insights/day",
  "/capture",
  "/mistakes/new",
  "/mistakes/found",
  "/battle",
  "/sheets",
  "/sheets/detail",
  "/dex",
];

const revision = process.env.GIT_SHA ?? `${Date.now()}`;

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    additionalPrecacheEntries: APP_ROUTES.map((url) => ({ url, revision })),
  });
