FROM node:20-alpine AS builder
WORKDIR /app

COPY .npmrc ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

COPY packages/shared-kernel/package.json packages/shared-kernel/tsconfig.json packages/shared-kernel/
COPY packages/event-contracts/package.json packages/event-contracts/tsconfig.json packages/event-contracts/
COPY packages/common/package.json packages/common/tsconfig.json packages/common/
COPY apps/notification-service/package.json apps/notification-service/tsconfig.json apps/notification-service/tsconfig.build.json apps/notification-service/nest-cli.json apps/notification-service/

RUN npm install -g pnpm@9.4.0
RUN pnpm install --frozen-lockfile --filter @mythfood/notification-service --prod false

COPY packages/shared-kernel/src packages/shared-kernel/src/
COPY packages/event-contracts/src packages/event-contracts/src/
COPY packages/common/src packages/common/src/
COPY apps/notification-service/src apps/notification-service/src/

RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build
RUN pnpm --filter @mythfood/notification-service build

FROM node:20-alpine AS production
WORKDIR /app

COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.npmrc ./

COPY --from=builder /app/packages/shared-kernel/package.json packages/shared-kernel/
COPY --from=builder /app/packages/shared-kernel/dist packages/shared-kernel/dist/
COPY --from=builder /app/packages/event-contracts/package.json packages/event-contracts/
COPY --from=builder /app/packages/event-contracts/dist packages/event-contracts/dist/
COPY --from=builder /app/packages/common/package.json packages/common/
COPY --from=builder /app/packages/common/dist packages/common/dist/
COPY --from=builder /app/apps/notification-service/package.json apps/notification-service/
COPY --from=builder /app/apps/notification-service/dist apps/notification-service/dist/

RUN npm install -g pnpm@9.4.0 && apk add --no-cache tzdata
RUN node -e "const pkg=require('./package.json');delete pkg.scripts.prepare;require('fs').writeFileSync('./package.json',JSON.stringify(pkg,null,2))"
RUN pnpm install --frozen-lockfile --filter @mythfood/notification-service --prod

EXPOSE 3013
CMD ["node", "apps/notification-service/dist/main.js"]
