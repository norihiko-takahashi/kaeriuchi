"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DisplayMode, Grade } from "@/shared/schemas";

/** 画面の表示に使う、いま使っている子どもの学年と表示モード */
interface AppState {
  grade: Grade;
  mode: DisplayMode;
  setView: (view: { grade: Grade; mode: DisplayMode }) => void;
  activeChildId: string | null;
  setActiveChildId: (id: string | null) => void;
  /** 保護者メニューを開いている（PIN を確認済み）か */
  parentUnlockedAt: number | null;
  unlockParent: () => void;
  lockParent: () => void;
}

const Ctx = createContext<AppState | null>(null);

const ACTIVE_CHILD_KEY = "kaeriuchi:active-child";

/** 保護者の画面は、何も操作しないまま5分たつと閉じる（BR-2.5） */
export const PARENT_IDLE_MS = 5 * 60_000;

function readActiveChild(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_CHILD_KEY);
  } catch {
    return null;
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  // 保護者向けの画面は中学生モード（ふりがななし）を基本にする
  const [view, setViewState] = useState<{ grade: Grade; mode: DisplayMode }>({
    grade: "j3",
    mode: "junior",
  });
  // 最初の描画の時点で読む（ページを開き直したとき、子どもの画面がプロフィール選択に戻らないように）。
  // 画面には直接表示しない値なので、サーバーでの描画と食い違っても問題ない
  const [activeChildId, setActive] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readActiveChild(),
  );
  const [parentUnlockedAt, setUnlocked] = useState<number | null>(null);

  // E2E テストで「画面が操作できる状態になった」ことを確かめるための目印
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = view.mode;
  }, [view.mode]);

  const setActiveChildId = useCallback((id: string | null) => {
    setActive(id);
    try {
      if (id) sessionStorage.setItem(ACTIVE_CHILD_KEY, id);
      else sessionStorage.removeItem(ACTIVE_CHILD_KEY);
    } catch {
      // プライベートブラウズなどで使えなくても動くようにする
    }
  }, []);

  const lockParent = useCallback(() => setUnlocked(null), []);
  const unlockParent = useCallback(() => setUnlocked(Date.now()), []);

  // 操作があるたびに、保護者の画面の時間を延ばす
  useEffect(() => {
    if (parentUnlockedAt === null) return;
    const bump = () => setUnlocked(Date.now());
    const events = ["pointerdown", "keydown"] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const timer = window.setTimeout(lockParent, PARENT_IDLE_MS);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearTimeout(timer);
    };
  }, [parentUnlockedAt, lockParent]);

  const value = useMemo<AppState>(
    () => ({
      ...view,
      setView: setViewState,
      activeChildId,
      setActiveChildId,
      parentUnlockedAt,
      unlockParent,
      lockParent,
    }),
    [
      view,
      activeChildId,
      setActiveChildId,
      parentUnlockedAt,
      unlockParent,
      lockParent,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStateProvider の中で使ってください");
  return v;
}
