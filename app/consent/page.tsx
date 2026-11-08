"use client";

import { useState } from "react";
import { useNav } from "@/client/pwa/navigate";
import { recordConsent } from "@/client/store/repo";
import { Gate } from "@/components/gate";
import { Button, Page } from "@/components/ui";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";

/**
 * S-03 同意。
 * 文章は仮のもの。本番で使う前に、法務・プライバシーの確認を受ける（BR-5.3）。
 */
export default function Consent() {
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
          <p className="rounded-[var(--radius)] bg-surface p-3 text-sm text-muted">
            この文章は仮のものです（版 {CURRENT_CONSENT_VERSION}）。
          </p>

          <section
            className="card flex flex-col gap-2 p-4"
            aria-labelledby="kid-ver"
          >
            <h2 id="kid-ver" className="text-lg font-bold">
              おこさま むけ
            </h2>
            <ul className="list-disc pl-6">
              <li>
                まちがえた もんだいの しゃしんを とると、その もんだい だけを AI
                に みせて、とっくんの もんだいを つくるよ。
              </li>
              <li>しゃしんは どこにも のこらないよ。</li>
              <li>ほんとうの なまえや がっこうの なまえは いれないでね。</li>
            </ul>
          </section>

          <section
            className="card flex flex-col gap-2 p-4"
            aria-labelledby="parent-ver"
          >
            <h2 id="parent-ver" className="text-lg font-bold">
              保護者の方へ
            </h2>
            <ul className="list-disc pl-6 text-sm">
              <li>
                写真は、お子さまが切り抜いた部分だけを、問題の解析のために AI
                のサービスへ送ります。写真はサーバーにも端末にも保存しません。
              </li>
              <li>AI のサービスには、入力を学習に使わない設定で送ります。</li>
              <li>
                ニックネーム・学年・解いた問題の記録は、端末と、国内のクラウドに保存します（本名、学校名、生年月日、性別、地域は集めません）。
              </li>
              <li>
                データは、保護者メニューからいつでも書き出し・削除できます。
              </li>
            </ul>
          </section>
        </Page>
      )}
    </Gate>
  );
}
