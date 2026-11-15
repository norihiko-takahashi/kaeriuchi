"use client";

import { useEffect, useState } from "react";
import { getSyncStatus, syncNow } from "@/client/sync/engine";
import { Button } from "./ui";

type Status = Awaited<ReturnType<typeof getSyncStatus>>;

const md = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}月${d}日`;
};

/** 続けて失敗したら「同期できていません」と出す回数 */
const FAILING = 3;

/** 同期の状態（U8 §4）。保護者メニューにだけ出す（子どもの画面には出さない） */
export function SyncStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSyncStatus().then(setStatus);
  }, []);

  if (!status) return null;
  return (
    <section className="card flex flex-col gap-2 p-4" aria-labelledby="sync-h">
      <h2 id="sync-h" className="font-bold">
        クラウドとの同期
      </h2>
      {status.signedOut ? (
        <p className="text-sm font-bold text-danger">
          この端末はログアウトしています。ログインし直すと、同期を続けます。
        </p>
      ) : status.failures >= FAILING ? (
        <p className="text-sm font-bold text-danger">
          同期できていません。インターネットにつながると、自動でやり直します。
        </p>
      ) : null}
      <p className="text-sm">
        最後に同期した日：
        {status.lastSyncedDay
          ? md(status.lastSyncedDay)
          : "まだ同期していません"}
      </p>
      <p className="text-sm">送っていない変更：{status.pending}件</p>
      <Button
        variant="secondary"
        disabled={busy || status.signedOut}
        onClick={async () => {
          setBusy(true);
          await syncNow();
          setStatus(await getSyncStatus());
          setBusy(false);
        }}
      >
        いま同期する
      </Button>
    </section>
  );
}
