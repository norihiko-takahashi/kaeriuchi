import { getDB } from "@/client/store/db";
import { getSyncStatus, retryDelay, syncNow } from "./engine";

/**
 * 同期のきっかけ（U8 §4）：起動したとき・画面が前に戻ったとき・変更のあと5秒・オンラインに戻ったとき。
 * 失敗したら、間隔をあけてやり直す（5秒から倍にして、最大5分・U8-PERF-2）。
 */

const AFTER_CHANGE_MS = 5_000;

export function startSyncLoop(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = (ms: number) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  async function run() {
    if (stopped) return;
    const outcome = await syncNow();
    if (outcome === "failed")
      schedule(retryDelay((await getSyncStatus()).failures));
  }

  const onVisible = () => {
    if (document.visibilityState === "visible") schedule(0);
  };
  const onOnline = () => schedule(0);
  const onChange = () => {
    // 変更の書き込み（トランザクション）が終わってから送る
    schedule(AFTER_CHANGE_MS);
  };

  const outbox = getDB().outbox;
  outbox.hook("creating", onChange);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  schedule(0);

  return () => {
    stopped = true;
    clearTimeout(timer);
    outbox.hook("creating").unsubscribe(onChange);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
  };
}
