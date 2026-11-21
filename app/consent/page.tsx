import { ConsentView } from "@/components/consent-view";
import { getConfig, operatorOf } from "@/server/config";

/** S-03 同意。運営者の名前と問い合わせ先は、設定から入れる（リポジトリに書かない） */
export default function Consent() {
  return <ConsentView operator={operatorOf(getConfig())} />;
}
