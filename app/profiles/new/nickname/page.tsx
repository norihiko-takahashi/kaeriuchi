"use client";

import { useEffect, useState } from "react";
import { isStandalone } from "@/client/pwa/install";
import { useNav } from "@/client/pwa/navigate";
import { createChild, getGuardian } from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import {
  AVATAR_ACCESSORIES,
  AVATAR_COLORS,
  AVATAR_FACES,
  Avatar,
} from "@/components/avatar";
import { Gate } from "@/components/gate";
import { Button, ErrorText, Page } from "@/components/ui";
import {
  checkNickname,
  NICKNAME_ERROR_MESSAGES,
  NICKNAME_MAX,
} from "@/domain/profile/nickname";
import { useDraft } from "../draft";

function Picker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-1 font-bold">{label}</legend>
      {options.map((name, i) => (
        <label
          key={name}
          className={`tap card flex cursor-pointer items-center px-3 ${
            value === i ? "border-4 border-primary" : ""
          }`}
        >
          <input
            type="radio"
            className="sr-only"
            name={label}
            checked={value === i}
            onChange={() => onChange(i)}
          />
          {name}
        </label>
      ))}
    </fieldset>
  );
}

/** S-06 プロフィール作成：ニックネームとアバター */
export default function Nickname() {
  const router = useNav();
  const { draft, update } = useDraft();
  const { setActiveChildId } = useAppState();
  const [error, setError] = useState<string>();
  const [confirmRealName, setConfirmRealName] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft.grade || !draft.guideRead) router.replace("/profiles/new");
  }, [draft.grade, draft.guideRead, router]);

  const save = async (existing: string[], force = false) => {
    if (!draft.grade) return;
    const check = checkNickname(draft.nickname, existing);
    if (check.error) {
      setError(NICKNAME_ERROR_MESSAGES[check.error]);
      return;
    }
    if (check.looksLikeRealName && !force) {
      setConfirmRealName(true);
      return;
    }
    setSaving(true);
    const child = await createChild({
      nickname: check.value,
      grade: draft.grade,
      avatar: draft.avatar,
    });
    setActiveChildId(child.id);
    const guardian = await getGuardian();
    // 最後に、ホーム画面への追加を案内する（U1-PWA の iOS の注意点）
    const showInstall = !isStandalone() && !guardian?.installPromptDismissedAt;
    router.replace(showInstall ? "/install" : "/profiles");
  };

  return (
    <Gate level="pin">
      {({ children }) => {
        const existing = children.map((c) => c.nickname);
        return (
          <Page
            title="ニックネームと アバター"
            footer={
              confirmRealName ? (
                <div
                  className="card flex flex-col gap-3 p-4"
                  role="alertdialog"
                  aria-labelledby="realname-title"
                >
                  <p id="realname-title" className="font-bold">
                    これって ほんとうの なまえ かな？
                  </p>
                  <p className="text-sm">
                    ほんとうの なまえ なら、ちがう なまえに
                    しよう。かえりうちネーム なら そのままで OK！
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmRealName(false)}
                  >
                    なおす
                  </Button>
                  <Button
                    onClick={() => save(existing, true)}
                    disabled={saving}
                  >
                    このままに する
                  </Button>
                </div>
              ) : (
                <Button onClick={() => save(existing)} disabled={saving}>
                  できた！
                </Button>
              )
            }
          >
            <div className="flex justify-center">
              <Avatar
                config={draft.avatar}
                size={120}
                label="えらんだ アバター"
              />
            </div>
            <label className="flex flex-col gap-2 font-bold">
              ニックネーム（{NICKNAME_MAX}もじ まで）
              <input
                value={draft.nickname}
                onChange={(e) => {
                  update({ nickname: e.target.value });
                  setError(undefined);
                  setConfirmRealName(false);
                }}
                aria-describedby="nickname-error"
                className="tap rounded-[var(--radius)] border border-line bg-surface px-4 font-normal"
              />
            </label>
            <ErrorText id="nickname-error">{error}</ErrorText>
            <Picker
              label="かお"
              options={AVATAR_FACES}
              value={draft.avatar.face}
              onChange={(face) => update({ avatar: { ...draft.avatar, face } })}
            />
            <Picker
              label="いろ"
              options={AVATAR_COLORS.map((_, i) => `いろ${i + 1}`)}
              value={draft.avatar.color}
              onChange={(color) =>
                update({ avatar: { ...draft.avatar, color } })
              }
            />
            <Picker
              label="アクセサリー"
              options={AVATAR_ACCESSORIES}
              value={draft.avatar.accessory}
              onChange={(accessory) =>
                update({ avatar: { ...draft.avatar, accessory } })
              }
            />
          </Page>
        );
      }}
    </Gate>
  );
}
