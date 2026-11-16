# かえりうち：standalone ビルドを動かすイメージ（infrastructure-design.md §3）
# 依存ライブラリ → ビルド → 実行、の3段階

ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Node.js 25 から corepack が入らなくなったので、package.json の packageManager の版の pnpm を npm で入れる
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
 && pnpm install --frozen-lockfile

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install -g "$(node -p "require('./package.json').packageManager")"
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA} NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
# RDS の証明書の束（TLS でデータベースの相手を確かめる・U8-PRIV-3）。AWS が公開しているもの
RUN mkdir -p certs && node -e "fetch('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem').then(async r=>{if(!r.ok)throw new Error(r.status);const t=await r.text();if(!t.includes('BEGIN CERTIFICATE'))throw new Error('bad bundle');require('fs').writeFileSync('certs/rds-global-bundle.pem',t)})"

FROM node:${NODE_VERSION}-slim AS run
WORKDIR /app
ARG GIT_SHA=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 GIT_SHA=${GIT_SHA}
# standalone の出力と、静的なファイルだけをコピーする。秘密情報はイメージに入れない
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# データベースの移行と毎日の削除（U8。ECS のタスクで、コマンドを差し替えて動かす）
COPY --from=build --chown=node:node /app/scripts/db-migrate.mjs /app/scripts/db-purge.mjs ./scripts/
COPY --from=build --chown=node:node /app/server/db/migrations ./server/db/migrations
COPY --from=build --chown=node:node /app/certs ./certs
# スクリプトから import "postgres" で読めるように、standalone の中の postgres を指す
RUN cd node_modules && ln -s "$(ls -d .pnpm/postgres@*/node_modules/postgres)" postgres
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
