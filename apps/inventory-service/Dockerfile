FROM node:20-alpine AS builder

WORKDIR /app

# Corepack luôn tải pnpm từ registry.npmjs.org (không đọc .npmrc) nên hay chết với
# "Internal Error: Error when performing the request". -> Cài pnpm bằng npm qua mirror npmmirror.
RUN --mount=type=cache,id=mythfood-npm,target=/root/.npm npm install -g pnpm@9.4.0 --registry=https://registry.npmmirror.com --fetch-retries=5 --fetch-timeout=120000 --no-fund --no-audit

COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY package.json ./

COPY packages/shared-kernel ./packages/shared-kernel
COPY packages/event-contracts ./packages/event-contracts
COPY packages/common ./packages/common

COPY apps/inventory-service ./apps/inventory-service

RUN --mount=type=cache,id=mythfood-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --store-dir=/pnpm/store --prefer-offline --package-import-method=copy

RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build

RUN pnpm --filter @mythfood/inventory-service build

FROM node:20-alpine AS runner

WORKDIR /app

RUN (for i in 1 2 3 4 5; do apk add --no-cache tzdata && exit 0; sleep 5; done; exit 1)

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/inventory-service/dist ./apps/inventory-service/dist
COPY --from=builder /app/apps/inventory-service/node_modules ./apps/inventory-service/node_modules
COPY --from=builder /app/apps/inventory-service/package.json ./apps/inventory-service/package.json

EXPOSE 3005

CMD ["node", "apps/inventory-service/dist/main.js"]