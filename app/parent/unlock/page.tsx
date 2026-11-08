"use client";

import { useEffect, useState } from "react";
import { verifyPin } from "@/client/crypto/pin-hash";
import { useNav } from "@/client/pwa/navigate";
import { getLockout, setLockout } from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import { Gate } from "@/components/gate";
import { PinPad } from "@/components/pin-pad";
import { Button, ErrorText, Page } from "@/components/ui";
import {
  GUARDIAN_PIN_LENGTH,
  registerFailure,
  registerSuccess,
  remainingLockMs,
} from "@/domain/parent/pin";

const SCOPE = "guardian";

/** 次の画面は、アプリの中のパスだけを受け付ける */
function safeNext(raw: string | null): string {
  return raw && /^\/[a-z0-9/-]*$/.test(raw) ? raw : "/parent";
}

/**
 * S-09 保護者の確認。
 * 端末の認証（指紋・顔など・BR-2.4）は、U8 でパスキーと一緒に作る。
 */
export default function Unlock() {
  const router = useNav();
  const { setView, unlockParent } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setView({ grade: "j3", mode: "junior" });
  }, [setView]);

  const submit = async (pinHash: string) => {
    setChecking(true);
    const lock = await getLockout(SCOPE);
    const wait = remainingLockMs(lock, new Date());
    if (wait > 0) {
      setError(
        `続けて間違えたため、あと ${Math.ceil(wait / 1000)} 秒お待ちください`,
      );
      setChecking(false);
      return;
    }
    if (await verifyPin(pin, pinHash)) {
      await setLockout(SCOPE, registerSuccess());
      unlockParent();
      const next = safeNext(
        new URLSearchParams(window.location.search).get("next"),
      );
      router.replace(next);
      return;
    }
    const failed = registerFailure(lock, new Date());
    await setLockout(SCOPE, failed);
    const nextWait = remainingLockMs(failed, new Date());
    setError(
      nextWait > 0
        ? `PIN が違います。${Math.ceil(nextWait / 1000)} 秒後にもう一度お試しください`
        : "PIN が違います",
    );
    setPin("");
    setChecking(false);
  };

  return (
    <Gate level="pin">
      {({ guardian }) => (
        <Page
          title="おうちの方の確認"
          footer={
            <>
              <Button
                onClick={() => guardian.pinHash && submit(guardian.pinHash)}
                disabled={pin.length !== GUARDIAN_PIN_LENGTH || checking}
              >
                {checking ? "確認しています…" : "確認"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.replace("/profiles")}
              >
                もどる
              </Button>
            </>
          }
        >
          <PinPad
            length={GUARDIAN_PIN_LENGTH}
            value={pin}
            onChange={setPin}
            label="保護者の PIN（6桁）"
            describedBy="unlock-error"
          />
          <ErrorText id="unlock-error">{error}</ErrorText>
          <p className="text-sm text-muted">
            PIN
            を忘れたときは、ログインし直すと設定し直せます（ログインの機能と一緒に用意します）。
          </p>
        </Page>
      )}
    </Gate>
  );
}
