#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { betaConfigFromEnv } from "../lib/config";
import { buildKaeriuchi } from "../lib/kaeriuchi";

// 設定は環境変数から読む（個人のドメインなどをリポジトリに入れない・docs/deploy.md）
const app = new App();
buildKaeriuchi(app, betaConfigFromEnv(process.env));
