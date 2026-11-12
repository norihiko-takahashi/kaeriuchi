// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import type { DisplayMode, Grade } from "@/shared/schemas";
import { AppStateProvider, useAppState } from "./app-state";
import { RubyText } from "./ruby-text";

function As({
  grade,
  mode,
  children,
}: {
  grade: Grade;
  mode: DisplayMode;
  children: React.ReactNode;
}) {
  const { setView } = useAppState();
  useEffect(() => setView({ grade, mode }), [grade, mode, setView]);
  return <>{children}</>;
}

const ruby = [
  { word: "分母", reading: "ぶんぼ" },
  { word: "最小公倍数", reading: "さいしょうこうばいすう" },
  { word: "公倍数", reading: "こうばいすう" },
];
const text = "分母を、最小公倍数にそろえる";

function mount(grade: Grade, mode: DisplayMode) {
  const { container } = render(
    <AppStateProvider>
      <As grade={grade} mode={mode}>
        <p>
          <RubyText text={text} ruby={ruby} />
        </p>
      </As>
    </AppStateProvider>,
  );
  return container;
}

const html = (grade: Grade, mode: DisplayMode) => mount(grade, mode).innerHTML;

describe("RubyText（BR-6-7）", () => {
  it("習っていない漢字を含む語にだけ付ける。長い語を先に当てる", () => {
    // 小1：分・母は2年なので「分母」に付く。最小公倍数（最・倍は4年・3年）にも付く
    const e1 = html("e1", "lower");
    expect(e1).toContain("<rt>ぶんぼ</rt>");
    expect(e1).toContain("<rt>さいしょうこうばいすう</rt>");
    expect(e1).not.toContain("<rt>こうばいすう</rt>");
    // ふりがなを取り除くと、元の文に戻る（文字が欠けたり増えたりしない）
    const el = mount("e1", "lower");
    for (const r of el.querySelectorAll("rt, rp")) r.remove();
    expect(el.textContent).toBe(text);
  });

  it("習った漢字だけなら付けない。中学生モードでは付けない", () => {
    expect(html("e6", "upper")).not.toContain("<ruby>");
    expect(html("e1", "junior")).not.toContain("<ruby>");
  });

  it("ふりがながなければ、そのまま", () => {
    const { container } = render(
      <AppStateProvider>
        <RubyText text="そのまま" />
      </AppStateProvider>,
    );
    expect(container.textContent).toBe("そのまま");
  });
});
