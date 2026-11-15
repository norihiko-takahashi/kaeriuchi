import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/**
 * ログイン用のメールの送信（U8）。本番は Amazon SES（東京リージョン）、開発はログに出すだけ。
 * メールの本文に、子どものニックネームや記録は入れない。ログにメールアドレスは出さない（U8-PRIV-1）。
 */
export interface Mailer {
  sendLoginLink(to: string, url: string): Promise<void>;
  /** 開発用：送ったリンクを画面にも出してよいか */
  readonly showsLinks: boolean;
}

export const LOGIN_MAIL = {
  subject: "かえりうち ログイン用のリンク",
  body: (url: string) =>
    [
      "かえりうちに ログインするためのリンクです。",
      "",
      url,
      "",
      "このリンクは15分で使えなくなります。1回使うと、もう使えません。",
      "心あたりがない場合は、このメールを消してください（何もしなくてかまいません）。",
    ].join("\n"),
};

export class DevMailer implements Mailer {
  readonly showsLinks = true;
  constructor(private write: (line: string) => void = console.log) {}
  async sendLoginLink(_to: string, url: string) {
    this.write(JSON.stringify({ level: "info", event: "dev_login_link", url }));
  }
}

export class SesMailer implements Mailer {
  readonly showsLinks = false;
  constructor(
    private from: string,
    private client = new SESv2Client({ region: "ap-northeast-1" }),
  ) {}
  async sendLoginLink(to: string, url: string) {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: LOGIN_MAIL.subject, Charset: "UTF-8" },
            Body: { Text: { Data: LOGIN_MAIL.body(url), Charset: "UTF-8" } },
          },
        },
      }),
    );
  }
}
