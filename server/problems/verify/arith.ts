import {
  add,
  div,
  fromDecimal,
  mul,
  neg,
  type Rational,
  sub,
} from "@/domain/math/rational";

/**
 * 検算用の小さな計算器（U45-Q-3）。
 * 数字・小数・＋−×÷・かっこだけを読む。文字列をコードとして実行しない（eval などを使わない）。
 */

type Token =
  | { t: "num"; v: Rational }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "(" }
  | { t: ")" };

const OPS: Record<string, "+" | "-" | "*" | "/"> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "*": "*",
  "×": "*",
  "/": "/",
  "÷": "/",
};

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+|^\d+/.exec(src.slice(i));
      if (!m) return null;
      tokens.push({
        t: "num",
        v: fromDecimal(m[0].startsWith(".") ? `0${m[0]}` : m[0]),
      });
      i += m[0].length;
    } else if (c in OPS) {
      tokens.push({ t: "op", v: OPS[c] });
      i++;
    } else if (c === "(" || c === ")") {
      tokens.push({ t: c });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

/** 再帰下降で読む：式 = 項 (+|- 項)*、項 = 因子 (*|/ 因子)*、因子 = -因子 | 数 | ( 式 ) */
function parse(tokens: Token[]): Rational | null {
  let pos = 0;
  const peek = () => tokens[pos];

  function factor(): Rational {
    const tok = tokens[pos++];
    if (!tok) throw new SyntaxError("式が途中で終わっています");
    if (tok.t === "op" && tok.v === "-") return neg(factor());
    if (tok.t === "num") return tok.v;
    if (tok.t === "(") {
      const v = expr();
      if (tokens[pos++]?.t !== ")")
        throw new SyntaxError("かっこが閉じていません");
      return v;
    }
    throw new SyntaxError("読めない式です");
  }

  function term(): Rational {
    let v = factor();
    for (
      let tok = peek();
      tok?.t === "op" && (tok.v === "*" || tok.v === "/");
      tok = peek()
    ) {
      pos++;
      v = tok.v === "*" ? mul(v, factor()) : div(v, factor());
    }
    return v;
  }

  function expr(): Rational {
    let v = term();
    for (
      let tok = peek();
      tok?.t === "op" && (tok.v === "+" || tok.v === "-");
      tok = peek()
    ) {
      pos++;
      v = tok.v === "+" ? add(v, term()) : sub(v, term());
    }
    return v;
  }

  try {
    const v = expr();
    return pos === tokens.length ? v : null;
  } catch {
    return null;
  }
}

/** 長すぎる式は読まない（重い計算を避ける） */
const MAX_LENGTH = 120;

/**
 * 問題文が「式 = ?」の形なら、計算した答えを返す。
 * それ以外の形（文章題など）は null。そのときは検証役の AI で確かめる。
 */
export function evaluateProblem(prompt: string): Rational | null {
  const s = prompt.normalize("NFKC").trim();
  const m = /^(.+?)\s*=\s*[?？□()（）\s]*$/.exec(s);
  if (!m || m[1].length > MAX_LENGTH) return null;
  const tokens = tokenize(m[1]);
  if (!tokens || tokens.length === 0) return null;
  return parse(tokens);
}
