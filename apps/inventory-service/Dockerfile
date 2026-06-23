FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY package.json ./

COPY packages/shared-kernel ./packages/shared-kernel
COPY packages/event-contracts ./packages/event-contracts
COPY packages/common ./packages/common

COPY apps/inventory-service ./apps/inventory-service

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/event-contracts build
RUN pnpm --filter @mythfood/common build

RUN pnpm --filter @mythfood/inventory-service build

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/inventory-service/dist ./apps/inventory-service/dist
COPY --from=builder /app/apps/inventory-service/node_modules ./apps/inventory-service/node_modules
COPY --from=builder /app/apps/inventory-service/package.json ./apps/inventory-service/package.json

EXPOSE 3005

CMD ["node", "apps/inventory-service/dist/main.js"]