"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useNav } from "@/client/pwa/navigate";
import { getGuardian, listChildren } from "@/client/store/repo";
import { needsConsent } from "@/domain/consent";
import type { ChildProfile, Guardian } from "@/shared/schemas";
import { useAppState } from "./app-state";
import { Loading } from "./ui";

export type GateLevel = "login" | "consent" | "pin" | "child";

interface GateData {
  guardian: Guardian;
  children: ChildProfile[];
}

/**
 * 初めて使うときの流れ（ログイン → 同意 → 保護者の PIN → プロフィール）を
 * 飛ばして画面に入れないようにする。
 */
export function Gate({
  level,
  refresh = 0,
  children,
}: {
  level: GateLevel;
  /** 値を変えると、データを読み直す */
  refresh?: number;
  children: (data: GateData) => ReactNode;
}) {
  const router = useNav();
  const { activeChildId } = useAppState();
  const [data, setData] = useState<GateData | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh は読み直しのきっかけとして使う
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const guardian = await getGuardian();
      if (!guardian) return router.replace("/login");
      if (level !== "login" && needsConsent(guardian.consentVersion)) {
        return router.replace("/consent");
      }
      if ((level === "pin" || level === "child") && !guardian.pinHash) {
        return router.replace("/parent/pin-setup");
      }
      const kids = await listChildren();
      if (level === "child") {
        if (kids.length === 0) return router.replace("/profiles/new");
        if (!activeChildId || !kids.some((k) => k.id === activeChildId)) {
          return router.replace("/profiles");
        }
      }
      if (!cancelled) setData({ guardian, children: kids });
    })();
    return () => {
      cancelled = true;
    };
  }, [level, router, activeChildId, refresh]);

  if (!data) return <Loading />;
  return <>{children(data)}</>;
}
