"use client";

/**
 * テストの「まとめて たたかう」（BR-6-1）。戦い終えたミスモンを覚えておき、次のミスモンを選ぶ。
 * 画面を閉じたら忘れてよいので、sessionStorage に置く。
 */
const key = (sheetId: string) => `kaeriuchi:sheet-run:${sheetId}`;

function read(sheetId: string): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(key(sheetId)) ?? "[]");
  } catch {
    return [];
  }
}

export function startSheetRun(sheetId: string) {
  try {
    sessionStorage.setItem(key(sheetId), "[]");
  } catch {
    // 使えなくても動く（次のミスモンが選べないだけ）
  }
}

export function markSheetRun(sheetId: string, mistakeId: string) {
  try {
    const done = read(sheetId);
    if (!done.includes(mistakeId))
      sessionStorage.setItem(
        key(sheetId),
        JSON.stringify([...done, mistakeId]),
      );
  } catch {
    // 同上
  }
}

/** 次に戦うミスモン（候補の順に、まだ戦っていないもの） */
export function nextInSheetRun(
  sheetId: string,
  candidates: string[],
): string | undefined {
  const done = new Set(read(sheetId));
  return candidates.find((id) => !done.has(id));
}

/** 「#<ミスモンの ID>&sheet=<テストの ID>」を読む */
export function parseBattleHash(raw: string): {
  mistakeId: string;
  sheetId?: string;
} {
  const [mistakeId, ...rest] = raw.split("&");
  const sheet = rest.find((r) => r.startsWith("sheet="));
  return { mistakeId, sheetId: sheet?.slice("sheet=".length) || undefined };
}

export const battleHref = (mistakeId: string, sheetId?: string) =>
  `/battle#${mistakeId}${sheetId ? `&sheet=${sheetId}` : ""}`;
