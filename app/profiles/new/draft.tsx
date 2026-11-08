"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import type { AvatarConfig, Grade } from "@/shared/schemas";

interface Draft {
  grade?: Grade;
  guideRead: boolean;
  nickname: string;
  avatar: AvatarConfig;
}

interface DraftCtx {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}

const Ctx = createContext<DraftCtx | null>(null);

/** プロフィール作成の途中の内容（3つの画面で共有する） */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>({
    guideRead: false,
    nickname: "",
    avatar: { face: 0, color: 0, accessory: 0 },
  });
  return (
    <Ctx.Provider
      value={{ draft, update: (p) => setDraft((d) => ({ ...d, ...p })) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDraft(): DraftCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("DraftProvider の中で使ってください");
  return v;
}
