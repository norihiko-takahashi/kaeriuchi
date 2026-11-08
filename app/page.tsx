"use client";

import { useEffect } from "react";
import { useNav } from "@/client/pwa/navigate";
import {
  applyGradePromotion,
  getGuardian,
  listChildren,
} from "@/client/store/repo";
import { Loading } from "@/components/ui";
import { needsConsent } from "@/domain/consent";

/** S-01 スタート：状態に合わせて、次の画面に進める */
export default function Start() {
  const router = useNav();
  useEffect(() => {
    (async () => {
      const guardian = await getGuardian();
      if (!guardian) return router.replace("/login");
      if (needsConsent(guardian.consentVersion))
        return router.replace("/consent");
      if (!guardian.pinHash) return router.replace("/parent/pin-setup");
      await applyGradePromotion();
      const kids = await listChildren();
      router.replace(kids.length === 0 ? "/profiles/new" : "/profiles");
    })();
  }, [router]);
  return <Loading />;
}
