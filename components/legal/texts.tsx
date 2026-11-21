import Link from "next/link";

/**
 * 同意の文とプライバシーポリシーの文（1.0.0-beta・aidlc-docs/construction/legal/consent-privacy-draft.md）。
 * β版は知り合いの家庭だけで使う。誰でも使える形で公開する前に、弁護士の確認を受ける（2026-11-17 に決定）。
 * 運営者の名前と問い合わせのアドレスは、リポジトリに書かず、デプロイのときの設定（OPERATOR_NAME・SUPPORT_EMAIL）から入れる。
 */

export interface Operator {
  name: string;
  supportEmail: string;
}

const Mail = ({ to }: { to: string }) => (
  <a href={`mailto:${to}`} className="font-bold underline">
    {to}
  </a>
);

export function KidConsentText() {
  return (
    <ul className="list-disc pl-6">
      <li>おうちの ひとと いっしょに よんでね。</li>
      <li>
        まちがえた もんだいの しゃしんを とると、かこんだ ところ だけを AI に
        みせて、とっくんの もんだいを つくるよ。しゃしんは どこにも
        のこらないよ。
      </li>
      <li>
        ほんとうの なまえや がっこうの なまえは いれないでね。しゃしんに
        うつっていたら、ぬりつぶしてね。
      </li>
      <li>
        きみの きろくは、インターネットの むこうの きんこに だいじに
        あずかるよ。ほかの ひとには みえないよ。
      </li>
      <li>きろくを けしたいときは、おうちの ひとに いってね。</li>
    </ul>
  );
}

export function ParentConsentText({ operator }: { operator: Operator }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        いまは<strong>β版</strong>
        です。知り合いのご家庭にだけ、試しに使っていただいています。かえりうちは、
        {operator.name} が<strong>個人で</strong>
        運営しています。お子さまの記録を、次のように預かります。
      </p>
      <ol className="list-decimal flex flex-col gap-2 pl-6">
        <li>
          <strong>集めるもの</strong>
          ：保護者のメールアドレス（ログインのため）。お子さまのニックネーム・学年・アバター、まちがえた問題と、その練習の記録（日付だけ。時刻は残しません）。
          <strong>集めないもの</strong>
          ：本名、学校名、生年月日、性別、住んでいる地域、顔の写真。
        </li>
        <li>
          <strong>写真</strong>
          ：お子さまが囲んだ部分だけを、問題を読み取るために AI
          へ送ります。読み取りが終わったら消し、サーバーにも端末にも残しません。写真に名前などが写っていたら、送る前に塗りつぶせます。
        </li>
        <li>
          <strong>AI</strong>：Amazon Bedrock（AWS の東京リージョン）の AI
          を使います。送った内容が AI
          の学習に使われることはありません。不正な使い方を調べるため、AI
          とのやりとりの文字（写真は含みません）を30日間記録し、そのあと自動で消します。
        </li>
        <li>
          <strong>保存する場所</strong>：Amazon Web Services,
          Inc.（米国の会社）のクラウドの、<strong>東京リージョン</strong>
          に保存します。保存するときも送るときも暗号化し、ほかのご家庭からは見えない仕組みにしています。
        </li>
        <li>
          <strong>ログイン</strong>
          ：パスワードは使いません。メールのリンクか、パスキー（指紋・顔）でログインします。ログインは同じ端末で30日続き、保護者メニューから、ほかの端末をログアウトさせられます。
        </li>
        <li>
          <strong>書き出しと削除</strong>
          ：保護者メニューから、いつでも記録を書き出したり、お子さま・アカウントを削除したりできます。削除してから
          <strong>7日間</strong>
          は取り消せます。そのあと本当に消え、バックアップからも含めて、削除してから
          <strong>最長14日</strong>で完全に消えます。
        </li>
        <li>
          <strong>問題の報告</strong>
          ：お子さまが「あれ？おかしいかも」で送った内容（問題と答えの文字。ニックネームは含みません）は、問題の誤りを直すために使い、最長1年で消します。
        </li>
        <li>
          <strong>メール</strong>
          ：ログイン用のメールだけを送ります。宣伝のメールは送りません。
        </li>
        <li>
          <strong>広告・分析</strong>
          ：広告や、外部の分析のサービスは使いません。
        </li>
        <li>
          <strong>16歳未満のお子さま</strong>
          ：お子さまの利用には、保護者の方の同意が必要です。この同意は、保護者の方がしてください。
        </li>
        <li>
          <strong>変更</strong>
          ：この内容を変えるときは、アプリでお知らせし、もう一度同意をお願いします。
        </li>
      </ol>
      <p>
        くわしくは
        <Link href="/privacy" className="font-bold underline">
          プライバシーポリシー
        </Link>
        を見てください。お問い合わせ：
        <Mail to={operator.supportEmail} />
      </p>
    </div>
  );
}

const ROWS: [string, string, string][] = [
  [
    "保護者のメールアドレス",
    "ログイン、本人の確認、大切なお知らせ",
    "アカウントを削除するまで",
  ],
  [
    "ニックネーム・学年・アバター",
    "画面の表示、問題の難しさを合わせる",
    "削除するまで",
  ],
  [
    "まちがえた問題・練習の記録・テストの名前（日付だけ）",
    "学習の機能を提供する、保護者への学習のようすの表示",
    "削除するまで",
  ],
  [
    "問題を読み取るための写真（切り抜いた部分）",
    "AI で問題を読み取る",
    "読み取りが終わるまで（保存しない）",
  ],
  [
    "AI とのやりとりの文字（写真は含まない）",
    "不正な利用の調査、誤りの原因の調査",
    "30日",
  ],
  [
    "問題の報告・採点し直しの結果（文字だけ）",
    "問題の誤りを直す、品質を測る",
    "最長1年（アカウントを削除したときは一緒に消える）",
  ],
  ["接続元の IP アドレス", "不正なアクセスを防ぐ（回数の制限）", "1日"],
  [
    "ログインのための値（Cookie）",
    "ログインを続ける",
    "30日（使うたびに延びる）",
  ],
];

/** プライバシーポリシー（個人情報保護法 32条の公表事項を含む） */
export function PrivacyPolicyText({ operator }: { operator: Operator }) {
  const h = "text-lg font-bold";
  return (
    <div className="flex flex-col gap-5 text-sm">
      <p>
        いまは β版です（版
        1.0.0-beta）。誰でも使える形で公開する前に、内容を見直します。
      </p>
      <section className="flex flex-col gap-1">
        <h2 className={h}>1. 運営者</h2>
        <p>運営者：{operator.name}（個人）</p>
        <p>住所：お問い合わせいただければ、遅滞なくお答えします。</p>
        <p>
          お問い合わせ：
          <Mail to={operator.supportEmail} />
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={h}>2. 取り扱う個人情報と、使う目的</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="p-2">
                  情報
                </th>
                <th scope="col" className="p-2">
                  使う目的
                </th>
                <th scope="col" className="p-2">
                  保存する期間
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([what, why, how]) => (
                <tr key={what} className="border-b border-line align-top">
                  <th scope="row" className="p-2 font-normal">
                    {what}
                  </th>
                  <td className="p-2">{why}</td>
                  <td className="p-2">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>本名・学校名・生年月日・性別・地域・顔の写真は集めません。</p>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={h}>3. 16歳未満のお子さまの情報</h2>
        <p>
          お子さまの情報は、保護者の方の同意を得て取り扱います。お子さまにとっての利益を第一に考え、集める情報は学習に必要な最小限にします。
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={h}>4. 第三者への提供</h2>
        <p>
          法令に基づく場合を除き、保護者の方の同意なく第三者に提供しません。広告や分析のサービスには、何も渡しません。
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={h}>5. 外部のサービス（クラウド）</h2>
        <ul className="list-disc pl-6">
          <li>
            データの保存・アプリの動作：Amazon Web
            Services（AWS）。会社は米国、データを保存するサーバーは日本（東京リージョン）
          </li>
          <li>
            AI：Amazon Bedrock（AWS
            の東京リージョン。リージョンをまたぐ処理は使いません）
          </li>
          <li>メールの送信：Amazon SES（AWS の東京リージョン）</li>
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={h}>6. 安全管理のための措置</h2>
        <ul className="list-disc pl-6">
          <li>
            組織：運営者が責任を持ち、記録を見るのは、問い合わせに答えるときだけにします
          </li>
          <li>人：運営者が、個人情報の扱いの決まりを学び、守ります</li>
          <li>物：運営者の端末は、画面のロックと暗号化をします</li>
          <li>
            技術：通信と保存を暗号化します。ご家庭ごとに、データベースの中でも見える範囲を分けています。ログインの値は、変換した値（ハッシュ）だけを保存します
          </li>
          <li>
            外国の制度の把握：AWS
            は米国の会社です。米国の制度を把握したうえで、データは日本のサーバーに保存しています
          </li>
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={h}>7. 開示・訂正・利用停止・削除の求め</h2>
        <p>
          保護者メニューから、いつでも記録を書き出し、直し、削除できます。そのほかの求めは
          <Mail to={operator.supportEmail} />
          へ。ログインしているメールアドレスから連絡していただき、本人であることを確かめます。手数料はいただきません。
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={h}>8. Cookie など</h2>
        <p>
          ログインを続けるための Cookie
          だけを使います。外部のサービスに、利用者の情報を送るしくみは使いません。
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className={h}>9. 変更</h2>
        <p>
          変えるときは、アプリでお知らせします。大切な変更のときは、もう一度同意をお願いします。
        </p>
      </section>
    </div>
  );
}
