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

# Copy identity-service
COPY apps/identity-service/package.json apps/identity-service/tsconfig.json apps/identity-service/tsconfig.build.json apps/identity-service/nest-cli.json apps/identity-service/

# Install pnpm globally
RUN npm install -g pnpm@9.4.0

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @mythfood/identity-service --prod false

# Copy source code
COPY packages/shared-kernel/src packages/shared-kernel/src/
COPY packages/event-contracts/src packages/event-contracts/src/
COPY packages/common/src packages/common/src/
COPY apps/identity-service/src apps/identity-service/src/

# Build dependency packages first
RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build

# Build identity-service
RUN pnpm --filter @mythfood/identity-service build

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

# Copy identity-service
COPY --from=builder /app/apps/identity-service/package.json apps/identity-service/
COPY --from=builder /app/apps/identity-service/dist apps/identity-service/dist/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter @mythfood/identity-service --prod

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "apps/identity-service/dist/main.js"]