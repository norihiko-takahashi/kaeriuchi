// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProblemDraft } from "@/shared/problem";
import { AppStateProvider, useAppState } from "../app-state";
import { AnswerInput } from "./answer-input";

function AsLower({ children }: { children: React.ReactNode }) {
  const { setView } = useAppState();
  useEffect(() => setView({ grade: "e1", mode: "lower" }), [setView]);
  return <>{children}</>;
}

afterEach(cleanup);

const base: Omit<ProblemDraft, "format"> = {
  role: "same-type",
  prompt: "どれ？",
  answer: "分母",
  hints: ["h"],
  explanation: "e",
  ruby: [{ word: "分母", reading: "ぶんぼ" }],
};

function mount(problem: ProblemDraft, onSubmit = vi.fn()) {
  const r = render(
    <AppStateProvider>
      <AsLower>
        <AnswerInput problem={problem} onSubmit={onSubmit} />
      </AsLower>
    </AppStateProvider>,
  );
  return { ...r, onSubmit };
}

describe("答えのボタンのふりがな（Issue #14）", () => {
  it("選択肢に、習っていない漢字のふりがなを付ける。読み上げの名前と答えはもとの文字", () => {
    const { container, onSubmit } = mount({
      ...base,
      format: { kind: "choice", options: ["分母", "分子"] },
    });
    expect(container.innerHTML).toContain("<rt>ぶんぼ</rt>");
    fireEvent.click(screen.getByRole("button", { name: "分母" }));
    expect(onSubmit).toHaveBeenCalledWith(
      { kind: "text", value: "分母" },
      "分母",
    );
  });

  it("並べかえの言葉にも付ける", () => {
    const { container } = mount({
      ...base,
      format: { kind: "ordering", tokens: ["分母", "を", "そろえる"] },
    });
    expect(container.innerHTML).toContain("<rt>ぶんぼ</rt>");
    expect(screen.getByRole("button", { name: "分母" })).toBeTruthy();
  });
});
