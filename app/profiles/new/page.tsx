"use client";

import { useEffect } from "react";
import { useNav } from "@/client/pwa/navigate";
import { MAX_CHILDREN } from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import { Gate } from "@/components/gate";
import { Button, Page } from "@/components/ui";
import { defaultDisplayMode, GRADE_LABELS } from "@/domain/profile/grade";
import { GRADES, type Grade } from "@/shared/constants";
import { useDraft } from "./draft";

/** S-04 プロフィール作成：学年 */
export default function ChooseGrade() {
  const router = useNav();
  const { draft, update } = useDraft();
  const { setView, parentUnlockedAt } = useAppState();

  const choose = (grade: Grade) => {
    update({ grade });
    setView({ grade, mode: defaultDisplayMode(grade) });
  };

  return (
    <Gate level="pin">
      {({ children }) =>
        children.length > 0 && parentUnlockedAt === null ? (
          <Redirect to="/parent/unlock?next=/profiles/new" />
        ) : children.length >= MAX_CHILDREN ? (
          <Page title="プロフィールは4人までです">
            <p>
              新しく作るには、保護者メニューからプロフィールを削除してください。
            </p>
          </Page>
        ) : (
          <Page
            title="なんねんせい？"
            footer={
              <Button
                disabled={!draft.grade}
                onClick={() => router.push("/profiles/new/nickname-guide")}
              >
                つぎへ
              </Button>
            }
          >
            <fieldset className="grid grid-cols-3 gap-3">
              <legend className="sr-only">がくねん</legend>
              {GRADES.map((g) => (
                <label
                  key={g}
                  className={`tap card flex cursor-pointer items-center justify-center p-2 text-center font-bold ${
                    draft.grade === g ? "border-4 border-primary" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="grade"
                    value={g}
                    className="sr-only"
                    checked={draft.grade === g}
                    onChange={() => choose(g)}
                  />
                  {GRADE_LABELS[g]}
                </label>
              ))}
            </fieldset>
          </Page>
        )
      }
    </Gate>
  );
}

/** 2人目からは、保護者の確認をしてから作る */
function Redirect({ to }: { to: string }) {
  const router = useNav();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}
