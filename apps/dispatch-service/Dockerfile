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

# Copy dispatch service
COPY apps/dispatch-service ./apps/dispatch-service

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages
RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build

# Build dispatch service
RUN pnpm --filter @mythfood/dispatch-service build

FROM node:20-alpine AS runner

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/dispatch-service/dist ./apps/dispatch-service/dist
COPY --from=builder /app/apps/dispatch-service/node_modules ./apps/dispatch-service/node_modules
COPY --from=builder /app/apps/dispatch-service/package.json ./apps/dispatch-service/package.json

EXPOSE 3008

CMD ["node", "apps/dispatch-service/dist/main.js"]