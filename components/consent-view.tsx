"use client";

import { useState } from "react";
import { useNav } from "@/client/pwa/navigate";
import { recordConsent } from "@/client/store/repo";
import { Gate } from "@/components/gate";
import {
  KidConsentText,
  type Operator,
  ParentConsentText,
} from "@/components/legal/texts";
import { Button, Page } from "@/components/ui";

/** S-03 同意（BR-5）。文は components/legal/texts.tsx */
export function ConsentView({ operator }: { operator: Operator }) {
  const router = useNav();
  const [checked, setChecked] = useState(false);

  const agree = async () => {
    await recordConsent();
    router.replace("/");
  };

  return (
    <Gate level="login">
      {() => (
        <Page
          title="はじめる前に"
          footer={
            <>
              <label className="tap flex items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  className="h-6 w-6"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                上の内容を読み、同意します
              </label>
              <Button onClick={agree} disabled={!checked}>
                同意して次へ
              </Button>
            </>
          }
        >
          <section
            className="card flex flex-col gap-2 p-4"
            aria-labelledby="kid-ver"
          >
            <h2 id="kid-ver" className="text-lg font-bold">
              おこさま むけ
            </h2>
            <KidConsentText />
          </section>

          <section
            className="card flex flex-col gap-2 p-4"
            aria-labelledby="parent-ver"
          >
            <h2 id="parent-ver" className="text-lg font-bold">
              保護者の方へ
            </h2>
            <ParentConsentText operator={operator} />
          </section>
        </Page>
      )}
    </Gate>
  );
}
