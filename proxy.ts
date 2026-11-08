import { type NextRequest, NextResponse } from "next/server";
import { buildCsp, createNonce } from "@/server/security/csp";

/**
 * 画面のリクエストごとに nonce を作り、CSP に入れる（U1-SEC-2）。
 * Next.js は、リクエストの CSP から nonce を読み取り、自分が出すスクリプトに付ける。
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // API、静的なファイル、Service Worker、アイコン、マニフェストには付けない
      source:
        "/((?!api|_next/static|_next/image|serwist|icons|manifest.webmanifest|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
