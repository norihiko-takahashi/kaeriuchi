"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { verifyPin } from "@/client/crypto/pin-hash";
import { useNav } from "@/client/pwa/navigate";
import { getLockout, setLockout } from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import { Avatar } from "@/components/avatar";
import { Gate } from "@/components/gate";
import { PinPad } from "@/components/pin-pad";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";
import {
  CHILD_PIN_LENGTH,
  registerFailure,
  registerSuccess,
  remainingLockMs,
} from "@/domain/parent/pin";
import type { ChildProfile } from "@/shared/schemas";

/** S-07 プロフィールを選ぶ */
export default function Profiles() {
  const router = useNav();
  const { setActiveChildId, setView, lockParent } = useAppState();
  const [pinFor, setPinFor] = useState<ChildProfile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setView({ grade: "e1", mode: "lower" });
    lockParent();
  }, [setView, lockParent]);

  const enter = (child: ChildProfile) => {
    setActiveChildId(child.id);
    setView({ grade: child.grade, mode: child.displayMode });
    router.push("/home");
  };

  const pick = (child: ChildProfile) => {
    if (child.pinHash) {
      setPinFor(child);
      setPin("");
      setError(undefined);
    } else enter(child);
  };

  const checkPin = async () => {
    if (!pinFor?.pinHash) return;
    const scope = `child:${pinFor.id}`;
    const lock = await getLockout(scope);
    const wait = remainingLockMs(lock, new Date());
    if (wait > 0) {
      setError(`あと ${Math.ceil(wait / 1000)}びょう まってね`);
      return;
    }
    if (await verifyPin(pin, pinFor.pinHash)) {
      await setLockout(scope, registerSuccess());
      enter(pinFor);
    } else {
      await setLockout(scope, registerFailure(lock, new Date()));
      setError("PIN が ちがうよ");
      setPin("");
    }
  };

  return (
    <Gate level="pin">
      {({ children }) =>
        pinFor ? (
          <Page
            title={`${pinFor.nickname} の PIN`}
            footer={
              <>
                <Button
                  onClick={checkPin}
                  disabled={pin.length !== CHILD_PIN_LENGTH}
                >
                  はいる
                </Button>
                <Button variant="secondary" onClick={() => setPinFor(null)}>
                  もどる
                </Button>
              </>
            }
          >
            <PinPad
              length={CHILD_PIN_LENGTH}
              value={pin}
              onChange={setPin}
              label="4けたの PIN"
              describedBy="child-pin-error"
            />
            <ErrorText id="child-pin-error">{error}</ErrorText>
          </Page>
        ) : (
          <Page
            title="だれが つかう？"
            footer={
              <Link
                href="/parent/unlock"
                className="tap self-end px-2 text-sm text-muted underline"
              >
                おうちのひと
              </Link>
            }
          >
            <ul className="grid grid-cols-2 gap-4">
              {children.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="tap card flex w-full flex-col items-center gap-2 p-4 font-bold"
                  >
                    <Avatar config={c.avatar} size={88} />
                    {c.nickname}
                    {c.pinHash ? (
                      <span className="text-xs text-muted">🔒 PIN</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {children.length < 4 ? (
              <LinkButton
                href="/parent/unlock?next=/profiles/new"
                variant="secondary"
              >
                ＋ プロフィールを ふやす（おうちのひと）
              </LinkButton>
            ) : null}
          </Page>
        )
      }
    </Gate>
  );
}
