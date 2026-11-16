import { type App, Tags } from "aws-cdk-lib";
import { AppStack } from "./app";
import { type EnvConfig, REGION } from "./config";
import { DataStack } from "./data";
import { MailStack } from "./mail";
import { NetworkStack } from "./network";
import { OpsStack } from "./ops";
import { RepoStack } from "./repo";
import { ZoneStack } from "./zone";

/**
 * かえりうちの AWS の構成をまとめる（infrastructure-design.md §2）。
 * デプロイの順番：Zone（NS を DNS に足す）→ Repo（イメージを送る）→ 残り（docs/deploy.md）
 */
export function buildKaeriuchi(app: App, config: EnvConfig) {
  const env = { account: config.account, region: REGION };
  const n = (s: string) => `${config.name}-${s}`;

  const zone = new ZoneStack(app, n("Zone"), config, { env });
  const repo = new RepoStack(app, n("Repo"), { env });
  const network = new NetworkStack(app, n("Network"), config, { env });
  const mail = new MailStack(app, n("Mail"), config, zone.zone, { env });
  const data = new DataStack(app, n("Data"), config, network, { env });
  const appStack = new AppStack(
    app,
    n("App"),
    config,
    {
      net: network,
      repository: repo.repository,
      zone: zone.zone,
      db: {
        host: data.db.dbInstanceEndpointAddress,
        port: data.db.dbInstanceEndpointPort,
      },
      adminSecret: data.adminSecret,
      appSecret: data.appSecret,
      mail,
    },
    { env },
  );
  const ops = new OpsStack(
    app,
    n("Ops"),
    config,
    {
      alb: appStack.alb,
      targetGroup: appStack.targetGroup,
      service: appStack.service,
      db: data.db,
    },
    { env },
  );

  for (const s of [zone, repo, network, mail, data, appStack, ops]) {
    Tags.of(s).add("app", "kaeriuchi");
    Tags.of(s).add("env", config.name);
  }
  return { zone, repo, network, mail, data, app: appStack, ops };
}
