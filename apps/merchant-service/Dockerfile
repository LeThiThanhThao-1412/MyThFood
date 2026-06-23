# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configs for pnpm
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY .npmrc ./
COPY tsconfig.base.json ./
COPY turbo.json ./

# Copy shared packages
COPY packages/shared-kernel/package.json packages/shared-kernel/tsconfig.json packages/shared-kernel/
COPY packages/event-contracts/package.json packages/event-contracts/tsconfig.json packages/event-contracts/
COPY packages/common/package.json packages/common/tsconfig.json packages/common/

# Copy merchant-service
COPY apps/merchant-service/package.json apps/merchant-service/tsconfig.json apps/merchant-service/tsconfig.build.json apps/merchant-service/nest-cli.json apps/merchant-service/

# Install pnpm globally
RUN npm install -g pnpm@9.4.0

# Install dependencies (only prod deps for build stage)
RUN pnpm install --frozen-lockfile --filter @mythfood/merchant-service --prod false

# Copy source code
COPY packages/shared-kernel/src packages/shared-kernel/src/
COPY packages/event-contracts/src packages/event-contracts/src/
COPY packages/common/src packages/common/src/
COPY apps/merchant-service/src apps/merchant-service/src/

# Build dependency packages first
RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build

# Build merchant-service
RUN pnpm --filter @mythfood/merchant-service build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.4.0

# Copy root configs
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.npmrc ./

# Copy packages with built dist
COPY --from=builder /app/packages/shared-kernel/package.json packages/shared-kernel/
COPY --from=builder /app/packages/shared-kernel/dist packages/shared-kernel/dist/
COPY --from=builder /app/packages/event-contracts/package.json packages/event-contracts/
COPY --from=builder /app/packages/event-contracts/dist packages/event-contracts/dist/
COPY --from=builder /app/packages/common/package.json packages/common/
COPY --from=builder /app/packages/common/dist packages/common/dist/

# Copy merchant-service
COPY --from=builder /app/apps/merchant-service/package.json apps/merchant-service/
COPY --from=builder /app/apps/merchant-service/dist apps/merchant-service/dist/

# Install production dependencies only (skip prepare scripts since no git)
RUN pnpm install --frozen-lockfile --filter @mythfood/merchant-service --prod --ignore-scripts

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/api/v1/health || exit 1

CMD ["node", "apps/merchant-service/dist/main.js"]