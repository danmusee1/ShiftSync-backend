# ShiftSync

Multi-location staff scheduling platform for **Coastal Eats** (4 locations, 2 timezones). This
repo is the backend only — a NestJS + PostgreSQL + Redis API. The frontend is a separate project
built afterward.

See [DECISIONS.md](./DECISIONS.md) for how every ambiguity in the spec was resolved, and why.

## Tech stack

- **NestJS 12** (Express, ESM/NodeNext), TypeScript, Vitest, oxlint
- **PostgreSQL** via **Prisma ORM**
- **Redis + BullMQ** for background jobs (drop-request expiry)
- **JWT** access + refresh tokens (bcrypt password hashing)
- **Socket.IO** for real-time updates (schedule publish/unpublish, notifications, on-duty feed)
- **Swagger** (`/docs`) for interactive API exploration

## Running it locally

### 1. Prerequisites

- Node.js 22+
- A PostgreSQL instance and a Redis instance. `docker-compose.yml` in this repo starts both:

```bash
docker compose up -d
```

(If you already have Postgres/Redis running elsewhere, just point `.env` at them instead.)

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` — at minimum `DATABASE_URL` and `REDIS_URL` need to point at real instances, and
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` should be random strings. SMTP fields are required for
the app to boot (env validation is strict) but don't need to be a *working* mailbox for local
dev — the mailer isn't wired into the boot path.

### 3. Install, migrate, seed

```bash
npm install
npx prisma migrate deploy   # or `npm run db:migrate` for dev-mode migrations
npm run seed
```

The seed script **wipes and repopulates** the database with a full demo dataset — see below.

### 4. Run

```bash
npm run start:dev
```

The API listens on `http://localhost:3000` (configurable via `PORT`). Interactive API docs are at
`http://localhost:3000/docs`.

### Tests

```bash
npm run test        # unit tests — the constraint engine's full rule coverage lives here
npm run test:e2e     # e2e (needs a running Postgres)
```

## Logging in as each role

After `npm run seed`, every account uses the password shown (all `@coastaleats.example`):

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Admin | `admin@coastaleats.example` | `ChangeMe123!` | Sees everything, all locations |
| Manager | `manager.westcoast@coastaleats.example` | `Password123!` | Runs Santa Monica **and** Pasadena |
| Manager | `manager.brooklyn@coastaleats.example` | `Password123!` | Runs Brooklyn |
| Manager | `manager.hoboken@coastaleats.example` | `Password123!` | Runs Hoboken |
| Staff | `<firstname>.<lastname>@coastaleats.example` | `Password123!` | 24 generated staff with varied skills/locations/availability |

Auth flow: `POST /auth/login` → `{ accessToken, refreshToken, user }`. Send
`Authorization: Bearer <accessToken>` on subsequent requests; `POST /auth/refresh` to rotate.

### Scenario staff (anchors for the BR evaluation scenarios)

All at `Password123!`:

| Login | Set up to demonstrate |
| --- | --- |
| `riley.onshift` | A Sunday-evening shift this week — drop it to walk **the Sunday Night Chaos** path: `POST /staff/:id/drop-requests`, have another qualified staff member `POST /swap-requests/:id/claim`, manager `POST /swap-requests/:id/approve`. |
| `jordan.fortyplus` | Already assigned ~45h this week at Santa Monica — hits `GET /compliance/overtime` as `OVERTIME` immediately, no setup needed. Try `POST /shifts/:id/assignments/preview` for one more shift on them to see the what-if warning before it's confirmed. |
| `avery.bicoastal` | Certified at Santa Monica (Pacific) **and** Brooklyn (Eastern), with a "9am-5pm" rule — **the Timezone Tangle**. Try assigning them to a Brooklyn evening shift; it's interpreted against their Pacific-time window (see DECISIONS.md). |
| `skyler.neverweekend` | Weekday-lunch-only shifts, zero Friday/Saturday evenings — **the Fairness Complaint**. Compare against other Santa Monica staff via `GET /fairness/premium-shifts`. |
| `drew.alldays` | Seven consecutive daily shifts with a documented manager override for day 7 — the 6th/7th-consecutive-day rule, both the warning and the override path. |
| `morgan.retired` | Certified, worked a shift two weeks ago, then decertified — historical shift/audit data still intact after decertification. |
| `sam.regretswap` | The other half of a **pending, un-approved swap** with Riley — cancel it (`POST /swap-requests/:id/cancel`) as either party to see the Regret Swap resolve cleanly. |

There's also an always-open drop request (any qualified server can `POST /swap-requests/:id/claim`
it — list open drops via `GET /swap-requests/open-drops`) and an unpublished draft week at Santa
Monica for next week.

**The Simultaneous Assignment** scenario isn't a static seed fact — fire two concurrent
`POST /shifts/:id/assignments` requests for the same staff member against two different shifts and
watch the loser get a clean structured conflict instead of a race. See DECISIONS.md for how the
locking works.

## API shape (selected)

- `POST /auth/login`, `/auth/refresh`, `/auth/logout`
- `GET/POST /users`, `/locations`, `/skills`, `/staff/:id/skills`, `/staff/:id/locations`
- `GET/POST /staff/:id/availability/rules`, `/exceptions`
- `POST /locations/:id/schedule-weeks`, `GET /schedule-weeks/:id`, `POST .../publish`, `.../unpublish`
- `POST /schedule-weeks/:id/shifts`, `GET/PATCH/DELETE /shifts/:id`
- `POST /shifts/:id/assignments`, `POST .../preview` (what-if), `DELETE .../:staffId`
- `POST /staff/:id/swap-requests`, `/drop-requests`; `POST /swap-requests/:id/{accept,decline,claim,cancel,approve,reject}`
- `GET /compliance/overtime`, `/fairness/hours-distribution`, `/fairness/premium-shifts`, `/fairness/desired-hours`
- `POST /shifts/:id/clock-in`, `/clock-out`; `GET /locations/:id/on-duty`
- `GET /audit/entities/:type/:id`, `GET /audit/export` (admin, streams XLSX)
- `GET/PATCH /notifications`

Full request/response shapes: `/docs` (Swagger).

Real-time (Socket.IO, JWT in `handshake.auth.token`): `notification.new` (personal),
`schedule.published` / `schedule.unpublished` / `onduty.update` (per-location rooms).

## Known limitations

- **Email delivery is best-effort and unmonitored.** Every notification for a user with the
  `IN_APP_AND_EMAIL` preference is enqueued (BullMQ) and sent via real SMTP off the request path,
  so a slow/unreachable mail server never blocks an API call — but a failed send is only logged
  as a warning server-side, not surfaced anywhere in-product. There's no delivery/bounce tracking.
- **Recurring availability can't cross midnight in one rule** — see DECISIONS.md. Two same-day
  rules cover it.
- **"Overtime cost" is reported in hours**, not dollars — no wage/pay-rate field exists in the
  spec or data model.
- **No frontend yet.** This is the backend deliverable; a separate app will consume this API.
- **Deploy workflow is written but not yet run** — `.github/workflows/deploy.yml` mirrors the
  team's existing GitLab→VPS pipeline, adapted for GitHub Actions, but needs real VPS/SSH secrets
  configured in the repo before it can deploy.
- **Suggestion ranking (`suggestions` on a blocked assignment) is a lightweight heuristic** — it
  filters to skill+certified+available+rested candidates and sorts by current weekly hours
  ascending (favoring fairness), evaluated against at most 25 candidates. It's meant to answer
  "who else could work this?", not to be an optimal scheduling solver.

## Deployment

**Live URL: https://shiftsync.civic-nexus.com** (nginx → PM2 app on port 4000, TLS via the
existing `*.civic-nexus.com` wildcard certificate — no per-subdomain cert needed).

`.github/workflows/deploy.yml` builds on push to `main` and deploys to the VPS via SSH/rsync +
PM2, mirroring the structure of the team's existing GitLab pipeline. Required GitHub repo
secrets: `SSH_PRIVATE_KEY` (a key dedicated to this workflow — never a personal or reused key),
`VPS_HOST`, `VPS_PORT`, `VPS_USER`, `DEPLOY_PATH`.

The VPS shares infrastructure with other projects, so this app is deliberately isolated from
them:

- **Deploy path**: `/var/www/nestjs/shiftsync-backend` — its own subfolder, not the shared
  `/var/www/nestjs` parent (which holds unrelated projects the deploy workflow's `rsync --delete`
  would otherwise wipe).
- **Database**: a dedicated Postgres role/database (`shiftsync_user` / `shiftsync`), separate
  from other apps' roles on the same Postgres instance.
- **Redis**: same Redis server as another app on this VPS, but a different logical DB
  (`redis://localhost:6379/1`) — no key collisions, and a `FLUSHDB` on either app can't touch the
  other's queues.
- **Port**: `4000` — chosen because `3000`, `2222`, and `3333` were already in use by other
  services on the box.

The VPS's `.env` (production secrets — DB/Redis URLs, JWT secrets, SMTP credentials) lives only
on the VPS, at `/var/www/nestjs/shiftsync-backend/.env`, and is never synced by the deploy
workflow (`rsync --exclude='.env'`). `CORS_ORIGIN` is currently `*` there since no frontend
domain exists yet — tighten it to the real frontend origin once one does.
