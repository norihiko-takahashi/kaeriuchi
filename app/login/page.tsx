"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  AuthApiError,
  loginWithPasskey,
  passkeySupported,
  sendLoginLink,
} from "@/client/auth/api";
import { useFinishSignIn } from "@/components/auth/finish-sign-in";
import { Button, ErrorText, Page } from "@/components/ui";

/**
 * S-02 ログイン（U8、US-1.4）。メールのリンク、またはパスキー。パスワードは使わない。
 * 子ども用の端末は、保護者のスマホに出した番号でつなぐ（/login/code）。
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [passkey, setPasskey] = useState(false);
  const { finish, conflictView } = useFinishSignIn();

  useEffect(() => setPasskey(passkeySupported()), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("メールアドレスの形式で入力してください");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setSent(await sendLoginLink(email.trim()));
    } catch (err) {
      setError(
        err instanceof AuthApiError
          ? err.userMessage
          : "うまくいきませんでした",
      );
    } finally {
      setBusy(false);
    }
  };

  const withPasskey = async () => {
    setError(undefined);
    try {
      const r = await loginWithPasskey();
      if ("guardianId" in r) await finish(r);
    } catch (err) {
      setError(
        err instanceof AuthApiError
          ? err.userMessage
          : "パスキーでログインできませんでした。メールのリンクでログインしてください",
      );
    }
  };

  if (conflictView)
    return <Page title="保護者の方のログイン">{conflictView}</Page>;

  if (sent)
    return (
      <Page title="メールを送りました">
        <p>
          {email.trim()}{" "}
          に、ログイン用のリンクを送りました。届いたメールのリンクを開いてください。
        </p>
        <p className="text-sm text-muted">
          リンクは15分で使えなくなります。届かないときは、迷惑メールのフォルダも見てください。
        </p>
        {sent.devLink ? (
          <p className="card p-3 text-sm">
            開発用：メールは送っていません。{" "}
            <a href={sent.devLink} className="font-bold underline">
              ここからリンクを開く
            </a>
          </p>
        ) : null}
        <Button variant="secondary" onClick={() => setSent(null)}>
          メールアドレスを入れ直す
        </Button>
      </Page>
    );

  return (
    <Page title="保護者の方のログイン">
      <p className="text-sm text-muted">
        パスワードは使いません。メールに届くリンクでログインします。
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-2 font-bold">
          メールアドレス
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby="login-error"
            className="tap rounded-[var(--radius)] border border-line bg-surface px-4 font-normal"
          />
        </label>
        <ErrorText id="login-error">{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          ログイン用のリンクを送る
        </Button>
      </form>
      {passkey ? (
        <Button variant="secondary" onClick={withPasskey}>
          パスキー（指紋・顔）でログイン
        </Button>
      ) : null}
      <Link
        href="/login/code"
        className="tap flex items-center justify-center font-bold underline"
      >
        子ども用の端末を、番号でつなぐ
      </Link>
      <Link
        href="/privacy"
        className="tap flex items-center justify-center text-sm underline"
      >
        プライバシーポリシー
      </Link>
    </Page>
  );
}
