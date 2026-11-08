"use client";

import { type ReactNode, useEffect } from "react";
import { useNav } from "@/client/pwa/navigate";
import type { ChildProfile, Guardian } from "@/shared/schemas";
import { useAppState } from "./app-state";
import { Gate } from "./gate";
import { Loading } from "./ui";

/** 保護者の PIN（または端末の認証）を確認していないと入れない画面 */
export function ParentGuard({
  refresh,
  children,
}: {
  refresh?: number;
  children: (data: {
    guardian: Guardian;
    children: ChildProfile[];
  }) => ReactNode;
}) {
  const router = useNav();
  const { parentUnlockedAt, setView } = useAppState();

  useEffect(() => {
    setView({ grade: "j3", mode: "junior" });
  }, [setView]);

  useEffect(() => {
    if (parentUnlockedAt === null) router.replace("/parent/unlock");
  }, [parentUnlockedAt, router]);

  if (parentUnlockedAt === null) return <Loading />;
  return (
    <Gate level="pin" refresh={refresh}>
      {children}
    </Gate>
  );
}
