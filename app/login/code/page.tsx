"use client";

import { type FormEvent, useId, useState } from "react";
import { AuthApiError, redeemLinkCode } from "@/client/auth/api";
import { useFinishSignIn } from "@/components/auth/finish-sign-in";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";

/**
 * 子ども用の端末を、番号でつなぐ（U8 決定 3）。番号は、保護者のスマホの保護者メニューで出す
 */
export default function LinkWithCode() {
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { finish, conflictView } = useFinishSignIn();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 8) return setError("8けたの番号を入れてください");
    setBusy(true);
    setError(undefined);
    try {
      await finish(await redeemLinkCode(digits));
    } catch (err) {
      setError(
        err instanceof AuthApiError
          ? err.code === "invalid"
            ? "番号がちがうか、時間が過ぎています。保護者のスマホで出し直してください"
            : err.userMessage
          : "うまくいきませんでした",
      );
    } finally {
      setBusy(false);
    }
  };

  if (conflictView) return <Page title="端末をつなぐ">{conflictView}</Page>;
  return (
    <Page
      title="端末をつなぐ"
      footer={
        <LinkButton href="/login" variant="secondary">
          メールでログインする
        </LinkButton>
      }
    >
      <p className="text-sm">
        保護者のスマホでログインして、保護者メニューの「ログインしている端末」→「この端末に番号を出す」を押すと、8けたの番号が出ます（10分で使えなくなります）。
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label htmlFor={id} className="font-bold">
          8けたの番号
        </label>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={9}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-describedby={`${id}-err`}
          className="tap rounded-[var(--radius)] border border-line bg-surface px-4 text-2xl tracking-widest"
        />
        <ErrorText id={`${id}-err`}>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          つなぐ
        </Button>
      </form>
    </Page>
  );
}
