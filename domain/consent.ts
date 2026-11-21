/**
 * 同意事項の版（BR-5.1）。文章を変えたら上げる（components/legal/texts.tsx）。
 * 1.0.0-beta：β版は知り合いの家庭だけで使う。誰でも使える形で公開する前に、弁護士の確認を受けて 1.0.0 にする（BR-5.3）。
 */
export const CURRENT_CONSENT_VERSION = "1.0.0-beta";

export function needsConsent(consentVersion: string | undefined): boolean {
  return consentVersion !== CURRENT_CONSENT_VERSION;
}
