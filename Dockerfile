# syntax = docker/dockerfile:1

# Below the Waterline: one Node process serving the built client, /readme/,
# /history/, the API and Socket.IO on 0.0.0.0:$PORT (fly.toml sets PORT).
# SQLite lives on the Fly volume mounted at /data (docs/DEPLOYMENT.md).

FROM docker.io/library/node:24.21.0-slim AS build
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json ./
COPY client/ client/
COPY shared/ shared/
RUN pnpm exec vite build

FROM docker.io/library/node:24.21.0-slim AS deps
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/below-waterline.sqlite
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY package.json README.md ./
COPY docs/ docs/
COPY server/ server/
COPY shared/ shared/
# No --init on Fly or in CI, so node is PID 1 and handles SIGTERM itself
# (server/index.ts flushes live voyages to SQLite before exiting).
CMD ["node", "server/index.ts"]
