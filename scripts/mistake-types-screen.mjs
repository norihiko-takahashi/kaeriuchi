// 画面で使う、間違いのタイプの小さい一覧を作る（名前・ミスモン・色・教科・学年だけ）。
// 例や単元まで画面に入れると、JavaScript の大きさの予算（200KB）を超えそうになるため。
//   node scripts/mistake-types-screen.mjs
// 一覧を直したら、これを実行する（mistake-types.test.ts が、ずれていないかを確かめる）。
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../content/mistake-types/", import.meta.url).pathname;
const subjects = ["math", "japanese", "english", "science", "social"];
const types = subjects.flatMap((s) =>
  JSON.parse(readFileSync(`${dir}${s}.json`, "utf8")).types.map(
    ({ id, subject, grades, label, monster, color }) => [
      id,
      subject,
      grades.join(" "),
      label,
      monster,
      color,
    ],
  ),
);
writeFileSync(
  `${dir}screen.json`,
  `${JSON.stringify({ note: "自動で作る（scripts/mistake-types-screen.mjs）。手で直さない。[id, 教科, 学年, 名前, ミスモン, 色]", types })}\n`,
);
console.log(`screen.json: ${types.length}件`);
