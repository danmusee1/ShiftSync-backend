# Deployment & Infrastructure

How the ShiftSync backend is built, shipped, and run in production — the Docker
architecture, the CI/CD pipeline, and the operational commands for running it yourself.

> This doc is written to be safe to publish: it describes the architecture and the
> commands, not any specific server, domain, or credential. Wherever a real value is
> needed (server IP, domain, deploy path) it's shown as a placeholder — substitute your
> own. Application secrets (`DATABASE_URL`, `JWT` secrets, SMTP credentials, etc.) live in
> a `.env` file on the server that is never committed and never touched by CI.

## Architecture at a glance

```
GitHub (development / main)
        │  push
        ▼
GitHub Actions
  ├─ validate  (every push to development or main): typecheck, lint, unit tests
  ├─ build     (push to main only): docker build → docker save → upload artifact
  └─ deploy    (push to main only): ship the image tarball to the server over SSH,
               load it, migrate, swap the running container, health-check
        │
        ▼
Server
  <deploy-path>/
    ├─ .env                  (production secrets — never committed, never synced by CI)
    └─ (docker images loaded here, no source checkout needed)

  docker run shiftsync-api --network host --restart unless-stopped
    ├─ connects to the server's Postgres
    ├─ connects to the server's Redis (for BullMQ job queues)
    └─ listens on 127.0.0.1:<port>

  reverse proxy (your domain) ──TLS──▶ 127.0.0.1:<port> ──▶ container
```

If this server also hosts other, unrelated projects, keep this app's resources
deliberately isolated from them — see "Shared-server isolation" below.

## The container

`Dockerfile` is a two-stage build:

1. **`builder`** — `node:22-bookworm-slim` + OpenSSL, installs all dependencies, generates
   the Prisma client, compiles TypeScript (`nest build`), then prunes dev dependencies.
2. **`runtime`** — a fresh `node:22-bookworm-slim` + OpenSSL, copies over only
   `node_modules` (production only), `dist/`, `prisma/` (needed for `migrate deploy` at
   runtime), and `package.json`. Runs as the non-root `node` user.

OpenSSL is installed in **both** stages deliberately — Prisma's query engine needs it not
just to run `prisma generate`, but to actually open a database connection at runtime.
Missing it in the runtime stage would build fine and fail silently later.

The image can run with `--network host` rather than Docker's default bridge networking if
Postgres/Redis already run bare-metal on the same host, shared with other apps — host
networking means the container sees `localhost:5432`/`localhost:6379` exactly like a
normal process would, no bridge-network hostname re-plumbing needed. If your database and
cache run elsewhere (a managed service, a separate container network), use normal bridge
networking instead and point `DATABASE_URL`/`REDIS_URL` at their actual hosts.

Recommended: tag images by **git commit SHA** (`shiftsync-backend:<sha>`), never `latest`
— you can always tell exactly which commit is running, and roll back to a specific
previous one.

## Shared-server isolation

If this server hosts other live projects, keep this app's resources separate everywhere
it matters:

| Resource | Recommendation |
| --- | --- |
| Deploy path | its own subfolder, not a shared parent directory other projects also write into |
| Database | a dedicated role/database, even if sharing the same Postgres *server* as other apps |
| Redis | a dedicated logical DB index (e.g. `redis://localhost:6379/1`) if sharing the same Redis *server* — avoids key collisions and shared `FLUSHDB` blast radius |
| Port | pick one nothing else on the box is already using |
| Reverse proxy | an **exact-match** server block for this app's domain — takes precedence over any wildcard/catch-all block already on the box, regardless of file load order |
| SSH deploy key | a dedicated key for this app's CI, added *alongside* any existing deploy keys, not replacing them |

## CI/CD pipeline (`.github/workflows/deploy.yml`)

**Branch flow:**
- `development` — every push runs `validate` only (typecheck, lint, unit tests). No
  deploy.
- `main` — push (or a merge from `development`) runs `validate` → `build` → `deploy`.
  This is the only thing that actually ships to production, so deploys are a deliberate
  act (merge to `main`), not a side effect of every commit on `development`.
- `pull_request` targeting `main` also runs `validate`, so you get a CI signal before
  merging.

**Required GitHub secrets** (repo Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `SSH_PRIVATE_KEY` | private key for a deploy-only SSH user on your server |
| `VPS_HOST` | your server's IP or hostname |
| `VPS_PORT` | SSH port (commonly `22`) |
| `VPS_USER` | the SSH/deploy user |
| `DEPLOY_PATH` | absolute path on the server to stage the image tarball (no trailing slash) |

**Why no container registry:** the `build` job builds the image and saves it to a
`.tar.gz` artifact; the `deploy` job downloads that artifact and ships it to the server via
`rsync`/`scp` + `docker load` over the same SSH connection already used for everything
else. This gets the main benefit of a registry-based flow — building once in CI and
deploying the exact tested artifact, rather than rebuilding on the production host —
without a registry account, image visibility settings, or an extra credential to create
and rotate.

**Deploy steps, in order:**
1. Load the shipped image (`docker load`).
2. Run `prisma migrate deploy` as a one-off container
   (`docker run --rm ... npx prisma migrate deploy`).
3. Stop/remove the previous container, start the new one (`--restart unless-stopped`, log
   rotation capped at 30MB — see "Logging" below).
4. Poll a `/health` endpoint for up to 30 seconds; fail the deploy loudly if it never
   comes up.
5. Prune old images, keeping the most recent few for manual rollback.

## Operational commands

Run on the server, from inside or outside the deploy directory.

**Logs:**
```bash
docker logs shiftsync-api                # full history (bounded — see below)
docker logs -f shiftsync-api             # follow live
docker logs --tail 100 shiftsync-api     # last 100 lines
docker logs --since 1h shiftsync-api     # last hour
```
Logs are capped at 30MB total (`--log-opt max-size=10m --log-opt max-file=3`) so they
can't grow the disk unbounded the way an unconfigured Docker logging driver would.

**Status & health:**
```bash
docker ps --filter name=shiftsync-api
curl -s http://127.0.0.1:<port>/health
curl -s https://your-domain.example/health
docker inspect shiftsync-api --format \
  'Image={{.Config.Image}} Restart={{.HostConfig.RestartPolicy.Name}} Started={{.State.StartedAt}}'
docker stats shiftsync-api --no-stream
```

**Which commit is actually deployed:**
```bash
docker inspect shiftsync-api --format '{{.Config.Image}}'
# → shiftsync-backend:<git-sha> — matches a commit 1:1
```

**Manual restart** (e.g. after editing `.env` — env vars are read at container start, so a
plain restart *won't* pick up `.env` changes; recreate instead):
```bash
docker restart shiftsync-api                      # same image, same env — just bounces the process
# vs., to pick up a changed .env:
docker rm -f shiftsync-api
docker run -d --name shiftsync-api --network host --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env-file .env shiftsync-backend:<sha>
```

**Roll back to a previous image:**
```bash
docker images shiftsync-backend                    # list available tags
docker rm -f shiftsync-api
docker run -d --name shiftsync-api --network host --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env-file .env shiftsync-backend:<previous-sha>
```

**Run a one-off command against the app's dependencies** (e.g. re-run migrations
manually):
```bash
docker run --rm --network host --env-file .env \
  shiftsync-backend:<sha> npx prisma migrate deploy
```

## Known gotchas (things that actually broke, and why)

- **`docker run --env-file` does not strip quotes.** If your `.env` has values like
  `DATABASE_URL="postgresql://..."` — fine for Node's `dotenv` parser, but Docker's
  `--env-file` flag passes the quote characters through *literally*, so the app sees a URL
  starting with `"` instead of `postgresql://` and refuses to connect. Fix: no quotes in
  the server's `.env` at all — Node's config loading handles unquoted values identically.
- **A leftover process manager can silently shadow every deploy.** If you migrate an app
  off PM2 (or similar) onto Docker, an old PM2-managed process can keep holding the port a
  new container tries to bind — health checks then keep *passing* the whole time because
  they're hitting the old process, not the new container, which makes the real failure
  invisible. Explicitly stop/delete any old process-manager-managed instance as part of
  the deploy script, every time, so this can't recur silently.
- **`npm ci` can fail in CI in ways that don't reproduce locally**, typically from
  cross-platform lockfile resolution differences (Windows-authored lockfile, Linux CI
  runner). `npm install` is less strict about lockfile/`package.json` sync and avoids this
  whole class of failure — a reasonable tradeoff for a CI validate step, since the actual
  production image is built with a full, deterministic dependency install inside the
  Dockerfile regardless.
