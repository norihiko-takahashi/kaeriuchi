"use client";

import { useEffect, useState } from "react";

/**
 * 画面に渡す ID は、URL の # のあとに入れる（例：/battle#<id>）。
 * # のあとはサーバーに送られず、Service Worker のキャッシュも同じページとして使えるので、オフラインでも開ける。
 */
export function useHashId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () =>
      setId(decodeURIComponent(window.location.hash.slice(1)) || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return id;
}
