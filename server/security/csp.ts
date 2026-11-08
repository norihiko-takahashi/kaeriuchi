/**
 * Content Security Policy（U1-SEC-2）。
 *
 * - スクリプトは、リクエストごとの nonce が付いたものだけを動かす（'unsafe-inline' は使わない）。
 *   'strict-dynamic' で、nonce の付いたスクリプトが読み込むファイル（画面ごとのプログラム）も許可する。
 * - 外部のドメインは1つも許可しない。外部のサービスが必要になったら、
 *   先に data-inventory.md を更新してレビューを受ける。
 * - スタイルは 'unsafe-inline' を許可する。React の style 属性や、ライブラリが書き込むスタイルに必要なため。
 *   CSS の注入でできることは、スクリプトの注入よりずっと少ない（code-summary.md §3）。
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** 推測できない nonce（16バイトのランダム値を base64 にしたもの） */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
