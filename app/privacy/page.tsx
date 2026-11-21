import type { Metadata } from "next";
import { PrivacyPolicyText } from "@/components/legal/texts";
import { LinkButton, Page } from "@/components/ui";
import { getConfig, operatorOf } from "@/server/config";

export const metadata: Metadata = { title: "プライバシーポリシー｜かえりうち" };

/** プライバシーポリシー（ログインしていなくても読める） */
export default function Privacy() {
  return (
    <Page
      title="プライバシーポリシー"
      footer={
        <LinkButton href="/" variant="secondary">
          もどる
        </LinkButton>
      }
    >
      <PrivacyPolicyText operator={operatorOf(getConfig())} />
    </Page>
  );
}
