"use client";

import { type FormEvent, useState } from "react";
import { useNav } from "@/client/pwa/navigate";
import { devSignIn } from "@/client/store/repo";
import { Button, ErrorText, Page } from "@/components/ui";

/**
 * S-02 ログイン。
 * U1 では開発用（メールアドレスを入れるだけ）。U8 でマジックリンクとパスキーに置き換える。
 */
export default function Login() {
  const router = useNav();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("メールアドレスの形式で入力してください");
      return;
    }
    await devSignIn(email);
    router.replace("/");
  };

  return (
    <Page title="保護者の方のログイン">
      <p className="rounded-[var(--radius)] bg-surface p-3 text-sm text-muted">
        開発用のログインです。メールは送られません（本番では、メールのリンクとパスキーでログインします）。
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
        <Button type="submit">ログイン</Button>
      </form>
    </Page>
  );
}
