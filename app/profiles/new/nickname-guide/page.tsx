"use client";

import { useEffect } from "react";
import { useNav } from "@/client/pwa/navigate";
import { Gate } from "@/components/gate";
import { NicknameGuide } from "@/components/nickname-guide";
import { Button, Page } from "@/components/ui";
import { useDraft } from "../draft";

/** S-05 プロフィール作成：名前の説明。「わかった」を押すと次へ */
export default function Guide() {
  const router = useNav();
  const { draft, update } = useDraft();

  useEffect(() => {
    if (!draft.grade) router.replace("/profiles/new");
  }, [draft.grade, router]);

  return (
    <Gate level="pin">
      {() => (
        <Page
          title="なまえの おやくそく"
          footer={
            <Button
              onClick={() => {
                update({ guideRead: true });
                router.push("/profiles/new/nickname");
              }}
            >
              わかった！
            </Button>
          }
        >
          <NicknameGuide />
        </Page>
      )}
    </Gate>
  );
}
