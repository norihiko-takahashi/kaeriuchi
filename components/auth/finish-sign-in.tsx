"use client";

import { useState } from "react";
import { type SignedIn, signOut } from "@/client/auth/api";
import { useNav } from "@/client/pwa/navigate";
import { adoptAccount, deleteAllLocalData } from "@/client/store/repo";
import { syncNow } from "@/client/sync/engine";
import { Button } from "@/components/ui";

/**
 * ログインのあと、この端末の記録とアカウントを結びつける（U8 §4）。
 * 別のアカウントの記録がある端末では混ぜずに、「消して続ける」か「やめる」を選んでもらう。
 */
export function useFinishSignIn() {
  const router = useNav();
  const [conflict, setConflict] = useState<SignedIn | null>(null);

  const finish = async (account: SignedIn) => {
    const r = await adoptAccount(account);
    if (r === "conflict") return setConflict(account);
    // クラウドの記録（同意・プロフィールなど）を受け取ってから進む。失敗しても、あとで裏で同期する
    await syncNow().catch(() => {});
    router.replace("/");
  };

  const view = conflict ? (
    <section
      className="card flex flex-col gap-3 p-4"
      aria-labelledby="conflict-h"
    >
      <h2 id="conflict-h" className="font-bold">
        この端末には、ほかのアカウントの記録があります
      </h2>
      <p className="text-sm">
        2つのアカウントの記録は混ぜません。この端末の記録を消して、ログインしたアカウントで続けるか、ログインをやめるかを選んでください。消した記録は、元のアカウントでログインし直せば、クラウドから戻ります（同期が終わっている分）。
      </p>
      <Button
        variant="danger"
        onClick={async () => {
          await deleteAllLocalData();
          await finish(conflict);
        }}
      >
        この端末の記録を消して続ける
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          await signOut().catch(() => {});
          setConflict(null);
          router.replace("/login");
        }}
      >
        やめる
      </Button>
    </section>
  ) : null;

  return { finish, conflictView: view };
}
