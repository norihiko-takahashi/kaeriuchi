"use client";

import { useState } from "react";
import { hashPin } from "@/client/crypto/pin-hash";
import { useNav } from "@/client/pwa/navigate";
import { setGuardianPinHash } from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import { Gate } from "@/components/gate";
import { PinPad } from "@/components/pin-pad";
import { Button, ErrorText, Page } from "@/components/ui";
import {
  GUARDIAN_PIN_LENGTH,
  PIN_ERROR_MESSAGES,
  validateGuardianPin,
} from "@/domain/parent/pin";

/** 保護者の PIN を設定する（同意の直後に必ず・BR-2.1） */
export default function PinSetup() {
  const router = useNav();
  const { unlockParent } = useAppState();
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const next = () => {
    const err = validateGuardianPin(first);
    if (err) return setError(PIN_ERROR_MESSAGES[err]);
    setError(undefined);
    setStep("confirm");
  };

  const save = async () => {
    if (second !== first) {
      setError("1回目と同じ PIN を入力してください");
      setSecond("");
      return;
    }
    setSaving(true);
    await setGuardianPinHash(await hashPin(first));
    unlockParent();
    router.replace("/");
  };

  return (
    <Gate level="consent">
      {() => (
        <Page
          title="保護者の PIN を決めてください"
          footer={
            step === "enter" ? (
              <Button
                onClick={next}
                disabled={first.length !== GUARDIAN_PIN_LENGTH}
              >
                次へ
              </Button>
            ) : (
              <Button
                onClick={save}
                disabled={second.length !== GUARDIAN_PIN_LENGTH || saving}
              >
                {saving ? "設定しています…" : "設定する"}
              </Button>
            )
          }
        >
          <p className="text-sm text-muted">
            お子さまが保護者メニュー（使い方のルール、データの削除など）に入れないようにするための6桁の数字です。同じ数字のくり返しや、連続した数字は使えません。
          </p>
          {step === "enter" ? (
            <PinPad
              length={GUARDIAN_PIN_LENGTH}
              value={first}
              onChange={setFirst}
              label="6桁の PIN"
              describedBy="pin-error"
            />
          ) : (
            <PinPad
              length={GUARDIAN_PIN_LENGTH}
              value={second}
              onChange={setSecond}
              label="確認のため、もう一度入力してください"
              describedBy="pin-error"
            />
          )}
          <ErrorText id="pin-error">{error}</ErrorText>
        </Page>
      )}
    </Gate>
  );
}
