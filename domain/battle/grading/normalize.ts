/**
 * 答えの文字をそろえる（BR-45-7）。
 * 全角・半角、ひらがな・カタカナ、大文字・小文字、前後と中の空白、終わりの句読点を区別しない。
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "")
    .replace(/[。、.,!！?？]+$/u, "");
}

/** 英語の文の並べ替えなど、単語の区切りを残してそろえる */
export function normalizeWords(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*[.,!?]+$/u, "");
}

/** 2つの文字の、編集の距離（レーベンシュタイン距離） */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[y.length];
}
