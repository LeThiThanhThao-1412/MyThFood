FROM node:20-alpine AS builder
WORKDIR /app

COPY .npmrc ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

COPY packages/shared-kernel/package.json packages/shared-kernel/tsconfig.json packages/shared-kernel/
COPY packages/common/package.json packages/common/tsconfig.json packages/common/
COPY apps/upload-service/package.json apps/upload-service/tsconfig.json apps/upload-service/tsconfig.build.json apps/upload-service/nest-cli.json apps/upload-service/

RUN npm install -g pnpm@9.4.0
RUN pnpm install --frozen-lockfile --filter @mythfood/upload-service --prod false

COPY packages/shared-kernel/src packages/shared-kernel/src/
COPY packages/common/src packages/common/src/
COPY apps/upload-service/src apps/upload-service/src/

RUN pnpm --filter @mythfood/shared-kernel build
RUN pnpm --filter @mythfood/common build
RUN pnpm --filter @mythfood/upload-service build

FROM node:20-alpine AS production
WORKDIR /app

COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.npmrc ./

COPY --from=builder /app/packages/shared-kernel/package.json packages/shared-kernel/
COPY --from=builder /app/packages/shared-kernel/dist packages/shared-kernel/dist/
COPY --from=builder /app/packages/common/package.json packages/common/
COPY --from=builder /app/packages/common/dist packages/common/dist/
COPY --from=builder /app/apps/upload-service/package.json apps/upload-service/
COPY --from=builder /app/apps/upload-service/dist apps/upload-service/dist/

RUN npm install -g pnpm@9.4.0
RUN node -e "const pkg=require('./package.json');delete pkg.scripts.prepare;require('fs').writeFileSync('./package.json',JSON.stringify(pkg,null,2))"
RUN pnpm install --frozen-lockfile --filter @mythfood/upload-service --prod

RUN mkdir -p /app/uploads
EXPOSE 3010
CMD ["node", "apps/upload-service/dist/main.js"]