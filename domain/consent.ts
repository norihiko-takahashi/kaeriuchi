/**
 * 同意事項の版（BR-5.1）。文章を変えたら上げる。
 * 文章は仮のもの。本番で使う前に、法務・プライバシーの確認を受ける（BR-5.3）。
 */
export const CURRENT_CONSENT_VERSION = "0.1.0-draft";

export function needsConsent(consentVersion: string | undefined): boolean {
  return consentVersion !== CURRENT_CONSENT_VERSION;
}
