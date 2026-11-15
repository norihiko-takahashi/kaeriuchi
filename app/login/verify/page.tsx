"use client";

import { useEffect, useRef, useState } from "react";
import { AuthApiError, verifyLoginLink } from "@/client/auth/api";
import { useHashId } from "@/client/pwa/hash-id";
import { useFinishSignIn } from "@/components/auth/finish-sign-in";
import { LinkButton, Loading, Page } from "@/components/ui";

/**
 * メールのリンクを開いたところ（U8）。リンクの値は # のあとに入っている（サーバーのログに残らない）
 */
export default function VerifyLogin() {
  const token = useHashId();
  const [error, setError] = useState<string>();
  const { finish, conflictView } = useFinishSignIn();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    // リンクの値は、使ったらアドレスバーから消す
    history.replaceState(null, "", location.pathname);
    verifyLoginLink(token)
      .then(finish)
      .catch((e) =>
        setError(
          e instanceof AuthApiError ? e.userMessage : "うまくいきませんでした",
        ),
      );
  }, [token, finish]);

  if (conflictView)
    return <Page title="保護者の方のログイン">{conflictView}</Page>;
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
