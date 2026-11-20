FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
# Corepack luôn tải pnpm từ registry.npmjs.org (không đọc .npmrc) nên hay chết với
# "Internal Error: Error when performing the request". -> Cài pnpm bằng npm qua mirror npmmirror.
RUN --mount=type=cache,id=mythfood-npm,target=/root/.npm npm install -g pnpm@9.4.0 --registry=https://registry.npmmirror.com --fetch-retries=5 --fetch-timeout=120000 --no-fund --no-audit

# Copy root workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY package.json ./

# Copy packages
COPY packages/shared-kernel ./packages/shared-kernel
COPY packages/event-contracts ./packages/event-contracts
COPY packages/common ./packages/common

# Copy wallet service
COPY apps/wallet-service ./apps/wallet-service

# Install dependencies
RUN --mount=type=cache,id=mythfood-pnpm-store,target=/pnpm/store pnpm install --no-frozen-lockfile --store-dir=/pnpm/store --prefer-offline --package-import-method=copy

# Build shared packages
RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build

# Build wallet service
RUN pnpm --filter @mythfood/wallet-service build

FROM node:20-alpine AS runner

WORKDIR /app

RUN (for i in 1 2 3 4 5; do apk add --no-cache tzdata && exit 0; sleep 5; done; exit 1)

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/wallet-service/dist ./apps/wallet-service/dist
COPY --from=builder /app/apps/wallet-service/node_modules ./apps/wallet-service/node_modules
COPY --from=builder /app/apps/wallet-service/package.json ./apps/wallet-service/package.json

EXPOSE 3009

CMD ["node", "apps/wallet-service/dist/main.js"]