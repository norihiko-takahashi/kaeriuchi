"use client";

import { useEffect, useState } from "react";
import { storageStatus } from "@/client/pwa/install";
import { useNav } from "@/client/pwa/navigate";
import {
  deleteAllLocalData,
  deleteChild,
  exportData,
} from "@/client/store/repo";
import { useAppState } from "@/components/app-state";
import { ParentGuard } from "@/components/parent-guard";
import { Button, LinkButton, Page } from "@/components/ui";
import type { ChildProfile } from "@/shared/schemas";

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
  onDeleted,
}: {
  child: ChildProfile;
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
        onClick={async () => {
          await deleteChild(child.id);
          onDeleted();
        }}
      >
        {child.nickname} のデータを削除
      </Button>
    </div>
  );
}

/** S-12 データの管理（BR-4） */
export default function DataPage() {
  const router = useNav();
  const { lockParent, setActiveChildId } = useAppState();
  const [status, setStatus] = useState<{
    persisted: boolean;
    usage?: number;
  }>();
  const [confirmAll, setConfirmAll] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    storageStatus().then(setStatus);
  }, []);

  return (
    <ParentGuard refresh={tick}>
      {({ children }) => (
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

          <section className="card flex flex-col gap-3 p-4">
            <h2 className="font-bold">書き出し（JSON。画像は含みません）</h2>
            <Button
              variant="secondary"
              onClick={async () =>
                download("kaeriuchi-all.json", await exportData())
              }
            >
              すべて書き出す
            </Button>
            {children.map((c) => (
              <DeleteChild
                key={c.id}
                child={c}
                onDeleted={() => setTick((t) => t + 1)}
              />
            ))}
          </section>

          <section className="card flex flex-col gap-3 p-4">
            <h2 className="font-bold text-danger">すべて削除</h2>
            <p className="text-sm">
              この端末のデータをすべて削除し、ログアウトします。（クラウドのデータの削除は、ログインの機能と一緒に用意します。そのときは、ログインのし直しも必要になります。）
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
              onClick={async () => {
                await deleteAllLocalData();
                setActiveChildId(null);
                lockParent();
                router.replace("/login");
              }}
            >
              すべて削除する
            </Button>
          </section>
        </Page>
      )}
    </ParentGuard>
  );
}
