"use client";

import { type ReactNode, useEffect } from "react";
import type { ChildProfile } from "@/shared/schemas";
import { useAppState } from "./app-state";
import { Gate } from "./gate";

function WithView({
  child,
  children,
}: {
  child: ChildProfile;
  children: (child: ChildProfile) => ReactNode;
}) {
  const { setView } = useAppState();
  useEffect(() => {
    setView({ grade: child.grade, mode: child.displayMode });
  }, [child, setView]);
  return <>{children(child)}</>;
}

/** 子どもの画面の入り口。いま選んでいる子どもを渡し、その子の表示モードにする */
export function ChildGate({
  children,
}: {
  children: (child: ChildProfile) => ReactNode;
}) {
  const { activeChildId } = useAppState();
  return (
    <Gate level="child">
      {({ children: kids }) => {
        const child = kids.find((c) => c.id === activeChildId);
        return child ? <WithView child={child}>{children}</WithView> : null;
      }}
    </Gate>
  );
}
