"use client";

import { useEffect } from "react";
import { startSyncLoop } from "@/client/sync/runner";

/** 裏で同期を動かす（U8 §4）。画面には何も出さない（状態は保護者メニュー） */
export function SyncRunner() {
  useEffect(() => startSyncLoop(), []);
  return null;
}
