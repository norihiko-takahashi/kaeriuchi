"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * 画面の移動。オンラインなら Next.js の移動（速い）を使う。
 * オフラインのときは、Next.js の移動はネットワークから画面のデータを取ろうとして止まるので、
 * Service Worker がキャッシュしたページを直接開く（U1-PWA-2）。
 */
export function useNav() {
  const router = useRouter();
  const go = useCallback(
    (href: string, mode: "push" | "replace" = "push") => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (mode === "replace") window.location.replace(href);
        else window.location.assign(href);
        return;
      }
      if (mode === "replace") router.replace(href);
      else router.push(href);
    },
    [router],
  );
  return useMemo(
    () => ({
      push: (href: string) => go(href, "push"),
      replace: (href: string) => go(href, "replace"),
    }),
    [go],
  );
}
