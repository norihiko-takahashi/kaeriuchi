"use client";

import { useEffect, useState } from "react";
import { hashPin } from "@/client/crypto/pin-hash";
import { isStandalone } from "@/client/pwa/install";
import { useNav } from "@/client/pwa/navigate";
import { updateChild } from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import { Avatar } from "@/components/avatar";
import { InstallSteps } from "@/components/install-guide";
import { ParentGuard } from "@/components/parent-guard";
import { useSwUpdate } from "@/components/sw-update";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";
import { validateChildPin } from "@/domain/parent/pin";
import { GRADE_LABELS } from "@/domain/profile/grade";
import {
  checkNickname,
  NICKNAME_ERROR_MESSAGES,
} from "@/domain/profile/nickname";
import {
  DISPLAY_MODES,
  type DisplayMode,
  GRADES,
  type Grade,
  isDisplayMode,
} from "@/shared/constants";
import type { ChildProfile } from "@/shared/schemas";

const MODE_LABELS: Record<DisplayMode, string> = {
  lower: "低学年（ひらがな中心・読み上げ・大きなボタン）",
  upper: "高学年",
  junior: "中学生（落ち着いた見た目）",
};

function ChildEditor({
  child,
  others,
  onSaved,
}: {
  child: ChildProfile;
  others: string[];
  onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(child.nickname);
  const [grade, setGrade] = useState<Grade>(child.grade);
  const [mode, setMode] = useState<DisplayMode>(child.displayMode);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const check = checkNickname(nickname, others);
    if (check.error) return setError(NICKNAME_ERROR_MESSAGES[check.error]);
    if (pin && validateChildPin(pin))
      return setError("子どもの PIN は4桁の数字です");
    setError(undefined);
    await updateChild(child.id, {
      nickname: check.value,
      grade,
      ...(mode !== child.displayMode ? { displayMode: mode } : {}),
      ...(pin ? { pinHash: await hashPin(pin) } : {}),
    });
    setPin("");
    setSaved(true);
    onSaved();
  };

  const clearPin = async () => {
    await updateChild(child.id, { pinHash: undefined });
    onSaved();
  };

  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar config={child.avatar} size={48} />
        <strong>{child.nickname}</strong>
      </div>
      <label className="flex flex-col gap-1 text-sm font-bold">
        ニックネーム
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="tap rounded-[var(--radius)] border border-line bg-surface px-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        学年
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value as Grade)}
          className="tap rounded-[var(--radius)] border border-line bg-surface px-3 font-normal"
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {GRADE_LABELS[g]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        表示モード
        <select
          value={mode}
          onChange={(e) => {
            if (isDisplayMode(e.target.value)) setMode(e.target.value);
          }}
          className="tap rounded-[var(--radius)] border border-line bg-surface px-3 font-normal"
        >
          {DISPLAY_MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        子どもの PIN（任意・4桁）{child.pinHash ? "：設定済み" : ""}
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="tap rounded-[var(--radius)] border border-line bg-surface px-3 font-normal"
        />
      </label>
      <ErrorText>{error}</ErrorText>
      {saved ? (
        <output className="text-sm text-accent">保存しました</output>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>保存</Button>
        {child.pinHash ? (
          <Button variant="secondary" onClick={clearPin}>
            PIN を解除
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** S-10 保護者メニュー */
export default function ParentMenu() {
  const { waiting, applyUpdate } = useSwUpdate();
  const { lockParent } = useAppState();
  const [tick, setTick] = useState(0);
  const router = useNav();
  const [standalone, setStandalone] = useState(true);

  useEffect(() => setStandalone(isStandalone()), []);

  return (
    <ParentGuard refresh={tick}>
      {({ children }) => (
        <Page
          title="保護者メニュー"
          footer={
            <Button
              variant="secondary"
              onClick={() => {
                lockParent();
                router.push("/profiles");
              }}
            >
              保護者メニューを閉じる
            </Button>
          }
        >
          {waiting ? (
            <section
              className="card flex flex-col gap-2 p-4"
              aria-live="polite"
            >
              <p className="font-bold">あたらしいバージョンがあります</p>
              <Button onClick={applyUpdate}>いま切り替える</Button>
            </section>
          ) : null}

          {!standalone ? (
            <details className="card p-4">
              <summary className="tap cursor-pointer font-bold">
                ホーム画面に追加すると、データが消えにくくなります
              </summary>
              <div className="mt-2">
                <InstallSteps />
              </div>
            </details>
          ) : null}

          <nav className="grid grid-cols-2 gap-3">
            <LinkButton href="/parent/rules" variant="secondary">
              使い方のルール
            </LinkButton>
            <LinkButton href="/parent/data" variant="secondary">
              データの管理
            </LinkButton>
          </nav>

          <h2 className="text-lg font-bold">
            プロフィール（{children.length}/4）
          </h2>
          <ul className="flex flex-col gap-3">
            {children.map((c) => (
              <ChildEditor
                key={c.id}
                child={c}
                others={children
                  .filter((o) => o.id !== c.id)
                  .map((o) => o.nickname)}
                onSaved={() => setTick((t) => t + 1)}
              />
            ))}
          </ul>
          {children.length < 4 ? (
            <LinkButton href="/profiles/new">＋ プロフィールを追加</LinkButton>
          ) : null}
        </Page>
      )}
    </ParentGuard>
  );
}
