# syntax = docker/dockerfile:1

# The real app (ADRs 0003, 0005, 0006, 0007). It must serve HTTP on
# 0.0.0.0:$PORT and publish README.md at /readme/ (spec/README.md).

FROM docker.io/library/node:24.21.0-slim AS build
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json ./
COPY client/ client/
COPY shared/ shared/
COPY scripts/precompress.ts scripts/
RUN pnpm exec vite build && node scripts/precompress.ts dist

FROM docker.io/library/node:24.21.0-slim AS deps
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY package.json README.md ./
COPY server/ server/
COPY shared/ shared/
# No --init on Fly or in CI, so node is PID 1 and handles SIGTERM itself.
CMD ["node", "server/index.ts"]
