import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { describe, expect, it } from "vitest";
import { DevMailer, LOGIN_MAIL, SesMailer } from "./mail";

describe("ログイン用のメール（U8-PRIV-1）", () => {
  it("SES で送る。本文にはリンクと期限だけ（子どもの記録は入れない）", async () => {
    const ses = mockClient(SESv2Client);
    ses.on(SendEmailCommand).resolves({ MessageId: "m1" });
    const mailer = new SesMailer(
      "login@kaeriuchi.example",
      new SESv2Client({}),
    );
    expect(mailer.showsLinks).toBe(false);
    await mailer.sendLoginLink(
      "p@example.com",
      "https://k.example/login/verify#t",
    );
    const input = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.FromEmailAddress).toBe("login@kaeriuchi.example");
    expect(input.Destination?.ToAddresses).toEqual(["p@example.com"]);
    expect(input.Content?.Simple?.Subject?.Data).toBe(LOGIN_MAIL.subject);
    const body = input.Content?.Simple?.Body?.Text?.Data ?? "";
    expect(body).toContain("https://k.example/login/verify#t");
    expect(body).toContain("15分");
  });

  it("開発用は、リンクだけをログに出す（メールアドレスは出さない）", async () => {
    const lines: string[] = [];
    const mailer = new DevMailer((l) => lines.push(l));
    await mailer.sendLoginLink("p@example.com", "http://localhost/x");
    expect(lines.join()).toContain("http://localhost/x");
    expect(lines.join()).not.toContain("p@example.com");
  });
});
