/** ホーム画面に追加して開いているか */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

/** iPhone・iPad（iPadOS はデスクトップの Safari を名乗るので、タッチの有無も見る） */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** ブラウザに「保存したデータを消さないで」とお願いする（U1-PWA-4） */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageStatus(): Promise<{
  persisted: boolean;
  usage?: number;
  quota?: number;
}> {
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const estimate = await navigator.storage?.estimate?.();
  return { persisted, usage: estimate?.usage, quota: estimate?.quota };
}
