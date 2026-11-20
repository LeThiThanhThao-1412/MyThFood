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
COPY packages/instrumentation/package.json packages/instrumentation/tsconfig.json packages/instrumentation/
COPY apps/order-service/package.json apps/order-service/tsconfig.json apps/order-service/tsconfig.build.json apps/order-service/nest-cli.json apps/order-service/

# Corepack luôn tải pnpm từ registry.npmjs.org (không đọc .npmrc) nên hay chết với
# "Internal Error: Error when performing the request". -> Cài pnpm bằng npm qua mirror npmmirror.
RUN --mount=type=cache,id=mythfood-npm,target=/root/.npm npm install -g pnpm@9.4.0 --registry=https://registry.npmmirror.com --fetch-retries=5 --fetch-timeout=120000 --no-fund --no-audit
RUN --mount=type=cache,id=mythfood-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @mythfood/order-service --prod false --store-dir=/pnpm/store --prefer-offline --package-import-method=copy

COPY packages/shared-kernel/src packages/shared-kernel/src/
COPY packages/event-contracts/src packages/event-contracts/src/
COPY packages/common/src packages/common/src/
COPY packages/instrumentation/src packages/instrumentation/src/
COPY apps/order-service/src apps/order-service/src/

RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build
RUN pnpm --filter @mythfood/instrumentation build
RUN pnpm --filter @mythfood/order-service build

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
COPY --from=builder /app/packages/instrumentation/package.json packages/instrumentation/
COPY --from=builder /app/packages/instrumentation/dist packages/instrumentation/dist/
COPY --from=builder /app/apps/order-service/package.json apps/order-service/
COPY --from=builder /app/apps/order-service/dist apps/order-service/dist/

# Corepack luôn tải pnpm từ registry.npmjs.org (không đọc .npmrc) nên hay chết với
# "Internal Error: Error when performing the request". -> Cài pnpm bằng npm qua mirror npmmirror.
RUN --mount=type=cache,id=mythfood-npm,target=/root/.npm npm install -g pnpm@9.4.0 --registry=https://registry.npmmirror.com --fetch-retries=5 --fetch-timeout=120000 --no-fund --no-audit \
    && (for i in 1 2 3 4 5; do apk add --no-cache tzdata && exit 0; sleep 5; done; exit 1)
RUN node -e "const pkg=require('./package.json');delete pkg.scripts.prepare;require('fs').writeFileSync('./package.json',JSON.stringify(pkg,null,2))"
RUN --mount=type=cache,id=mythfood-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @mythfood/order-service --prod --store-dir=/pnpm/store --prefer-offline --package-import-method=copy

EXPOSE 3004
CMD ["node", "apps/order-service/dist/main.js"]