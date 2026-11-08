"use client";

import { useSerwist } from "@serwist/turbopack/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface SwUpdate {
  /** 新しいバージョンが待っている */
  waiting: boolean;
  /** 保護者メニューから、いますぐ切り替える */
  applyUpdate: () => void;
}

const Ctx = createContext<SwUpdate>({ waiting: false, applyUpdate: () => {} });

/**
 * 新しいバージョンへの切り替え（U1-PWA-3）。
 * Service Worker は自分からは切り替わらない（skipWaiting: false）。
 * アプリを全部閉じて次に開いたとき、または保護者メニューで押したときに切り替わる。
 */
export function SwUpdateProvider({ children }: { children: ReactNode }) {
  const { serwist } = useSerwist();
  const [waiting, setWaiting] = useState(false);
  const applyRequested = useRef(false);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => setWaiting(true);
    // 初めて開いたときにも controlling は起きるので、保護者が「いま切り替える」を
    // 押したときだけ再読み込みする（入力の途中で画面が消えないように）
    const onControlling = () => {
      if (applyRequested.current) window.location.reload();
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
    };
  }, [serwist]);

  const applyUpdate = useCallback(() => {
    applyRequested.current = true;
    serwist?.messageSkipWaiting();
  }, [serwist]);

  return (
    <Ctx.Provider value={{ waiting, applyUpdate }}>{children}</Ctx.Provider>
  );
}

export function useSwUpdate() {
  return useContext(Ctx);
}
