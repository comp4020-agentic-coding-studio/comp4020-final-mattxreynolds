# syntax = docker/dockerfile:1

# Dead Air: an Express server (TypeScript, run directly by Node 24's type
# stripping) serving the Vite-built React client and the game API. SQLite
# lives on the Fly volume at /data. The server renders README.md at /readme/.

FROM docker.io/library/node:24.21.0-slim AS base
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# full install, then build the client into dist/client
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# runtime dependencies only (express, marked, react for the build is already bundled)
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json README.md ./
COPY server ./server
COPY shared ./shared
COPY docs ./docs
CMD ["node", "server/index.ts"]
