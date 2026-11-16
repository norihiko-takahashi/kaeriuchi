"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type DeletedChild,
  deleteAccount,
  deleteChildInCloud,
  exportCloud,
  listDeletedChildren,
  restoreChildInCloud,
} from "@/client/auth/api";
import { storageStatus } from "@/client/pwa/install";
import { useNav } from "@/client/pwa/navigate";
import {
  deleteAllLocalData,
  deleteChild,
  exportData,
} from "@/client/store/repo";
import { syncNow } from "@/client/sync/engine";
import { useAppState } from "@/components/app-state";
import { useReauth } from "@/components/auth/reauth";
import { ParentGuard } from "@/components/parent-guard";
import { Button, ErrorText, LinkButton, Page } from "@/components/ui";
import type { ChildProfile } from "@/shared/schemas";

const md = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}月${d}日`;
};

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function DeleteChild({
  child,
  linked,
  run,
  onDeleted,
}: {
  child: ChildProfile;
  /** クラウドのアカウントにつないでいる（クラウドからも消す） */
  linked: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <p className="font-bold">{child.nickname}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () =>
            download(
              `kaeriuchi-${child.nickname}.json`,
              await exportData(child.id),
            )
          }
        >
          書き出す
        </Button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        削除するには、ニックネーム「{child.nickname}」を入力してください
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="tap rounded-[var(--radius)] border border-line bg-surface px-3"
        />
      </label>
      <Button
        variant="danger"
        disabled={confirm !== child.nickname}
        onClick={() =>
          run(async () => {
            // クラウドで消してから、端末からも消す（7日のうちは「消したデータ」から戻せる）
            if (linked) await deleteChildInCloud(child.id);
            await deleteChild(child.id);
            onDeleted();
          })
        }
      >
        {child.nickname} のデータを削除
      </Button>
    </div>
  );
}

/** 消したデータ（7日のうちは取り消せる・U8 §5） */
function DeletedChildren({
  refresh,
  onRestored,
}: {
  refresh: number;
  onRestored: () => void;
}) {
  const [list, setList] = useState<DeletedChild[] | null>(null);
  const [error, setError] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh は読み直しのきっかけとして使う
  useEffect(() => {
    listDeletedChildren()
      .then(setList)
      .catch(() => setList([]));
  }, [refresh]);
  if (!list || list.length === 0) return null;
  return (
    <section
      className="card flex flex-col gap-3 p-4"
      aria-labelledby="deleted-h"
    >
      <h2 id="deleted-h" className="font-bold">
        消したデータ
      </h2>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-2 border-t border-line pt-2"
          >
            <p className="text-sm">
              {c.nickname}（{md(c.purgeDay)} に完全に消えます）
            </p>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await restoreChildInCloud(c.id);
                  await syncNow();
                  onRestored();
                } catch {
                  setError(
                    "取り消せませんでした。インターネットにつながっているか確かめてください",
                  );
                }
              }}
            >
              {c.nickname} の削除を取り消す
            </Button>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}

/** S-12 データの管理（BR-4・U8 §5） */
export default function DataPage() {
  const router = useNav();
  const { lockParent, setActiveChildId } = useAppState();
  const [status, setStatus] = useState<{
    persisted: boolean;
    usage?: number;
  }>();
  const [confirmAll, setConfirmAll] = useState("");
  const [tick, setTick] = useState(0);
  const { run, reauthView, error } = useReauth();
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    storageStatus().then(setStatus);
  }, []);

  return (
    <ParentGuard refresh={tick}>
      {({ guardian, children }) => {
        const linked = !!guardian.accountLinkedAt;
        return (
          <Page
            title="データの管理"
            footer={
              <LinkButton href="/parent" variant="secondary">
                保護者メニューへ
              </LinkButton>
            }
          >
            <section className="card flex flex-col gap-2 p-4">
              <h2 className="font-bold">この端末の保存</h2>
              <p className="text-sm">
                データを消さないお願い：
                {status?.persisted
                  ? "許可されています"
                  : "まだ許可されていません（ホーム画面に追加すると許可されやすくなります）"}
              </p>
              {status?.usage !== undefined ? (
                <p className="text-sm">
                  使っている容量：約 {Math.ceil(status.usage / 1024)} KB
                </p>
              ) : null}
            </section>

            {reauthView}
            {error}

            <section className="card flex flex-col gap-3 p-4">
              <h2 className="font-bold">書き出し（JSON。画像は含みません）</h2>
              <Button
                variant="secondary"
                onClick={async () =>
                  download("kaeriuchi-all.json", await exportData())
                }
              >
                この端末の記録をすべて書き出す
              </Button>
              {linked ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    run(async () =>
                      download("kaeriuchi-cloud.json", await exportCloud()),
                    )
                  }
                >
                  クラウドの記録をすべて書き出す
                </Button>
              ) : null}
              {children.map((c) => (
                <DeleteChild
                  key={c.id}
                  child={c}
                  linked={linked}
                  run={run}
                  onDeleted={refresh}
                />
              ))}
            </section>

            {linked ? (
              <DeletedChildren refresh={tick} onRestored={refresh} />
            ) : null}

            <section className="card flex flex-col gap-3 p-4">
              <h2 className="font-bold text-danger">
                {linked ? "アカウントを削除" : "すべて削除"}
              </h2>
              <p className="text-sm">
                {linked
                  ? "クラウドの記録とアカウントを削除し、すべての端末をログアウトさせます。この端末のデータも消します。7日のうちなら、同じメールアドレスでログインすると取り消せます。そのあとは、14日のうちにバックアップからも消えます。"
                  : "この端末のデータをすべて削除します。"}
              </p>
              <label className="flex flex-col gap-1 text-sm">
                「すべて削除」と入力してください
                <input
                  value={confirmAll}
                  onChange={(e) => setConfirmAll(e.target.value)}
                  className="tap rounded-[var(--radius)] border border-line bg-surface px-3"
                />
              </label>
              <Button
                variant="danger"
                disabled={confirmAll !== "すべて削除"}
                onClick={() =>
                  run(async () => {
                    if (linked) await deleteAccount();
                    await deleteAllLocalData();
                    setActiveChildId(null);
                    lockParent();
                    router.replace("/login");
                  })
                }
              >
                {linked ? "アカウントを削除する" : "すべて削除する"}
              </Button>
            </section>
          </Page>
        );
      }}
    </ParentGuard>
  );
}
