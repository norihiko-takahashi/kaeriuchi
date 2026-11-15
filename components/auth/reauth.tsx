"use client";

import { useState } from "react";
import {
  AuthApiError,
  currentSession,
  loginWithPasskey,
  sendLoginLink,
} from "@/client/auth/api";
import { Button, ErrorText } from "@/components/ui";

/**
 * 削除・書き出しの前の確かめ直し（U8-SEC-7）。
 * サーバーが「ログインし直して」（reauth）と返したら、パスキーかメールのリンクで確かめてもらう。
 * パスキーなら、その場で確かめて、続きを動かす。
 */
export function useReauth() {
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null);
  const [error, setError] = useState<string>();
  const [mailed, setMailed] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  /** fn を動かす。確かめ直しが要れば、確かめてからもう一度動かす */
  const run = async (fn: () => Promise<void>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      if (e instanceof AuthApiError && e.code === "reauth") {
        setPending(() => fn);
        setMailed(false);
        setHasPasskey(
          await currentSession()
            .then((s) => s.hasPasskey)
            .catch(() => false),
        );
        return;
      }
      setError(
        e instanceof AuthApiError ? e.userMessage : "うまくいきませんでした",
      );
    }
  };

  const view = pending ? (
    <section
      className="card flex flex-col gap-3 p-4"
      aria-labelledby="reauth-h"
    >
      <h2 id="reauth-h" className="font-bold">
        大切な操作なので、もう一度確かめます
      </h2>
      {hasPasskey ? (
        <Button
          onClick={async () => {
            try {
              await loginWithPasskey(true);
              const fn = pending;
              setPending(null);
              await run(fn);
            } catch {
              setError(
                "パスキーで確かめられませんでした。メールのリンクでログインし直してください",
              );
            }
          }}
        >
          パスキー（指紋・顔）で確かめる
        </Button>
      ) : null}
      {mailed ? (
        <p className="text-sm">
          メールを送りました。届いたリンクをこの端末で開いてログインし直してから、もう一度この操作をしてください（10分のうちに）。
        </p>
      ) : (
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const s = await currentSession();
              const r = await sendLoginLink(s.email);
              setMailed(true);
              // 開発用：メールの代わりに、そのまま開く
              if (r.devLink) location.assign(r.devLink);
            } catch (e) {
              setError(
                e instanceof AuthApiError
                  ? e.userMessage
                  : "うまくいきませんでした",
              );
            }
          }}
        >
          メールのリンクでログインし直す
        </Button>
      )}
      <Button variant="secondary" onClick={() => setPending(null)}>
        やめる
      </Button>
    </section>
  ) : null;

  return {
    run,
    reauthView: view,
    error: error ? <ErrorText>{error}</ErrorText> : null,
  };
}
