FROM node:20-alpine
WORKDIR /app
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared-kernel/package.json packages/shared-kernel/
COPY packages/event-contracts/package.json packages/event-contracts/
COPY packages/common/package.json packages/common/
COPY apps/payment-service/package.json apps/payment-service/
RUN --mount=type=cache,id=mythfood-npm,target=/root/.npm npm install -g pnpm@9.4.0 --registry=https://registry.npmmirror.com --fetch-retries=5 --fetch-timeout=120000 --no-fund --no-audit
RUN --mount=type=cache,id=mythfood-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @mythfood/payment-service --prod false --store-dir=/pnpm/store --prefer-offline --package-import-method=copy
