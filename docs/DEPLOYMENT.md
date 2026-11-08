# Deployment

## Local development

```sh
pnpm install
pnpm dev          # http://localhost:8080, Vite HMR inside the Node server
```

## Production build and start

```sh
pnpm build        # client → dist/
pnpm start        # node server/index.ts, serves dist/ on 0.0.0.0:$PORT
```

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port (Fly sets 8080) |
| `HOST` | `0.0.0.0` | bind address |
| `DATABASE_PATH` | `./data/below-waterline.sqlite` (`/data/below-waterline.sqlite` in Docker) | SQLite file |
| `NODE_ENV` | — | `production` serves `dist/`; otherwise Vite middleware |
| `ENABLE_TEST_HOOKS` | unset | `1` enables `/api/test/*` (tests only, never production) |

## Fly.io

`fly.toml` is the course-managed shape and is unchanged: one
shared-cpu-1x/256 MB machine, one volume `data` at `/data`, auto stop/start.
The Dockerfile sets `DATABASE_PATH=/data/below-waterline.sqlite`, so every
voyage, seat and log entry lives on the volume and survives stop/start and
redeploys.

Deploy (manual, needs the course Fly token in `mise.local.toml`):

```sh
flyctl deploy --remote-only --ha=false -a <repo-name>
```

Once the repo is public, CI (`.github/workflows/checks.yml`) builds the
image, runs `pnpm check` against it, then deploys on push to `main`.

## Health

`GET /healthz` → `200 {"ok":true}` after the DB is open.

## Shutdown

SIGTERM/SIGINT: stop the tick loop, flush every live voyage to SQLite, close
sockets and DB, exit 0. Node is PID 1 in the container (no `--init`), which is
why the handler is in the app.
