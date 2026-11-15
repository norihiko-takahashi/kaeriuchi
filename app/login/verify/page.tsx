"use client";

import { useEffect, useRef, useState } from "react";
import {
  AuthApiError,
  type PendingRestore,
  restoreAccount,
  verifyLoginLink,
} from "@/client/auth/api";
import { useHashId } from "@/client/pwa/hash-id";
import { useFinishSignIn } from "@/components/auth/finish-sign-in";
import { Button, LinkButton, Loading, Page } from "@/components/ui";

const md = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}月${d}日`;
};

/**
 * メールのリンクを開いたところ（U8）。リンクの値は # のあとに入っている（サーバーのログに残らない）。
 * 削除の手続き中のアカウントなら、取り消すかどうかを選んでもらう（U8 §5）
 */
const fail = (setError: (m: string) => void) => (e: unknown) =>
  setError(
    e instanceof AuthApiError ? e.userMessage : "うまくいきませんでした",
  );

export default function VerifyLogin() {
  const token = useHashId();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<PendingRestore["restore"]>();
  const { finish, conflictView } = useFinishSignIn();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    // リンクの値は、使ったらアドレスバーから消す
    history.replaceState(null, "", location.pathname);
    verifyLoginLink(token)
      .then((r) => ("restore" in r ? setPending(r.restore) : finish(r)))
      .catch(fail(setError));
  }, [token, finish]);

  if (conflictView)
    return <Page title="保護者の方のログイン">{conflictView}</Page>;
  if (pending)
    return (
      <Page title="このアカウントは、削除の手続き中です">
        <p>
          {md(pending.purgeDay)}{" "}
          に、記録がすべて消えます。それまでなら、削除を取り消して、これまでの記録で続けられます。
        </p>
        <Button
          onClick={() =>
            restoreAccount(pending.ticket)
              .then(finish)
              .catch((e) => {
                setPending(undefined);
                fail(setError)(e);
              })
          }
        >
          削除を取り消して続ける
        </Button>
        <LinkButton href="/login" variant="secondary">
          やめる
        </LinkButton>
      </Page>
    );
  if (token === null || error)
    return (
      <Page title="ログインできませんでした">
        <p>{error ?? "リンクが正しくありません。"}</p>
        <p className="text-sm text-muted">
          リンクは15分で使えなくなり、1回使うと使えません。もう一度、ログイン用のリンクを送ってください。
        </p>
        <LinkButton href="/login">ログインの画面へ</LinkButton>
      </Page>
    );
  return <Loading />;
}
