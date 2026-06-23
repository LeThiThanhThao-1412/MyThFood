FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

# Copy root workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY package.json ./

# Copy packages
COPY packages/shared-kernel ./packages/shared-kernel
COPY packages/event-contracts ./packages/event-contracts
COPY packages/common ./packages/common

# Copy driver service
COPY apps/driver-service ./apps/driver-service

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages
RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build

# Build driver service
RUN pnpm --filter @mythfood/driver-service build

FROM node:20-alpine AS runner

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/driver-service/dist ./apps/driver-service/dist
COPY --from=builder /app/apps/driver-service/node_modules ./apps/driver-service/node_modules
COPY --from=builder /app/apps/driver-service/package.json ./apps/driver-service/package.json

EXPOSE 3007

CMD ["node", "apps/driver-service/dist/main.js"]