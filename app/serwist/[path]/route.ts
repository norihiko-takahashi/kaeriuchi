import { createSerwistRoute } from "@serwist/turbopack";

/** オフラインでも開けるようにする画面（アプリの外枠） */
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
];

const revision = process.env.GIT_SHA ?? `${Date.now()}`;

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    additionalPrecacheEntries: APP_ROUTES.map((url) => ({ url, revision })),
  });
