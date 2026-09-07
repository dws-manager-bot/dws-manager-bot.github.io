# DWS Alliance Manager

A Discord bot and web backoffice for running a **Dark War Survival** alliance:
scheduled announcements, a recurring event calendar with signups, and a member
roster — all configurable from a browser instead of by editing code.

```
GitHub Pages  ──  dws-manager-bot.github.io                static backoffice (HTTPS)
      │           Discord OAuth2 login → short-lived JWT
      ▼
https://dws-api.xronocore.qzz.io                            Cloudflare tunnel, edge TLS
      │
      ▼
k3s namespace: dws-manager                                  one pod, replicas: 1
   FastAPI (REST)  +  discord.py (gateway)  +  APScheduler
      │
      ▼
PostgreSQL 16 @ 192.168.1.136:5432                          database `dws_manager`
```

## Why the frontend can live on GitHub Pages

GitHub Pages serves static files only — it can never run the bot, which needs a
persistent gateway connection and a database. But the *backoffice* is just a
React bundle, and that is static.

The usual blocker is mixed content: a Pages site is HTTPS, so the browser
refuses to call a plain-HTTP API. The Cloudflare tunnel already terminates TLS
at the edge with a valid certificate, so the SPA calls an HTTPS origin and the
problem disappears. No port forwarding, no Let's Encrypt renewals.

The bundle holds **no secrets**. The bot token, database password and OAuth
client secret exist only in the Kubernetes secret. Login runs server-side:
Discord redirects to the API, the API verifies the caller actually holds an
officer role in the guild, and only then issues a JWT.

## Repository layout

```
backend/          FastAPI + discord.py + APScheduler (one process)
  src/dwsbot/
    main.py         entrypoint — runs the API and the bot in one event loop
    models.py       SQLAlchemy models
    scheduler.py    rebuilds APScheduler jobs from the database
    recurrence.py   rotation / weekday maths (pure, unit tested)
    security.py     Discord OAuth2 + JWT
    api/routers/    REST endpoints
    discord_bot/    the client and its slash-command cogs
  migrations/     Alembic
frontend/         Vite + React backoffice → GitHub Pages
deploy/           Kubernetes manifests
```

---

## Setup

### 1. Create the Discord application

At <https://discord.com/developers/applications> → **New Application**.

**Bot tab**
- *Reset Token* → this is `DISCORD_TOKEN`.
- Enable **Server Members Intent**. Without it the bot cannot see roles, and
  every permission check silently fails.

**OAuth2 tab**
- Copy the *Client ID* and *Client Secret*.
- Add this exact redirect URL:
  `https://dws-api.xronocore.qzz.io/auth/callback`

**Invite the bot** — OAuth2 → URL Generator, scopes `bot` and
`applications.commands`, permissions *Send Messages*, *Embed Links*,
*Read Message History*, *Mention Everyone*.

### 2. Database

Already provisioned on `xronocore`:

- database `dws_manager`, owned by role `dws_manager`
- `pg_hba.conf` allows that role from `10.42.0.0/16` (k3s pods) and
  `192.168.1.0/24` (LAN), and rejects it from everywhere else

Apply the schema:

```bash
cd backend
alembic upgrade head
```

The container also runs this at start-up, which is safe because the deployment
is pinned to a single replica.

### 3. Deploy the bot to k3s

```bash
cp deploy/secret.example.yaml deploy/secret.yaml   # gitignored
$EDITOR deploy/secret.yaml                          # fill in every value

kubectl apply -f deploy/namespace.yaml
kubectl apply -f deploy/secret.yaml
kubectl apply -f deploy/deployment.yaml
kubectl apply -f deploy/service.yaml
```

Copy the GHCR pull secret from an existing namespace:

```bash
kubectl get secret ghcr-pull-secret -n calorielens-prod -o yaml \
  | sed 's/namespace: calorielens-prod/namespace: dws-manager/' \
  | kubectl apply -f -
```

> **`replicas` must stay at 1.** A second pod opens a second gateway session and
> posts every scheduled announcement twice.

### 4. Expose the API through the existing tunnel

Add one hostname to the `cloudflared-config` ConfigMap in the `cloudflared`
namespace, above the catch-all:

```yaml
  - hostname: dws-api.xronocore.qzz.io
    service: http://dws-api.dws-manager.svc.cluster.local:80
```

Then restart the tunnel and add the DNS route:

```bash
kubectl rollout restart deployment/cloudflared -n cloudflared
cloudflared tunnel route dns <tunnel-name> dws-api.xronocore.qzz.io
```

### 5. Publish the backoffice

In the GitHub repo: **Settings → Pages → Source: GitHub Actions**, and set
repository variable `VITE_API_URL` to `https://dws-api.xronocore.qzz.io`.

The repo is named `dws-manager-bot.github.io` inside the org of the same
name, which makes it an *organization site* served from the domain root.
That is why Vite's `base` is `/` rather than a repo subpath.

Pushing to `main` builds and publishes it. The API's `CORS_ORIGINS` must include
`https://dws-manager-bot.github.io`, and `FRONTEND_URL` must be the full Pages URL.

---

## Using it

### Backoffice

Sign in with a Discord account holding a role listed in `ADMIN_ROLES` (default
`R5,R4`); the guild owner always qualifies.

- **Announcements** — schedule recurring posts. Four schedule types: cron,
  every-N-minutes, one-time, or *N minutes before an event*. "Send test"
  delivers immediately without touching the schedule.
- **Events** — define recurring game events on fixed weekdays, an N-day
  rotation, or explicit dates. "Preview schedule" shows the next occurrences
  before saving, which is worth using for rotations.
- **Roster** — import members from Discord and record in-game name, rank, power.

### Slash commands

| Command | Who | Purpose |
| --- | --- | --- |
| `/roster register` | anyone | Link Discord account to in-game name |
| `/roster list` | anyone | Show the roster |
| `/roster remove` | officers | Deactivate a member |
| `/events next` | anyone | Upcoming events, in each viewer's timezone |
| `/events post <key>` | anyone | Post a signup sheet with buttons |
| `/admin announcements` | officers | List schedules and next fire times |
| `/admin test <id>` | officers | Send one announcement now |
| `/admin reload` | officers | Rebuild the schedule from the database |
| `/admin channels` | officers | List channel IDs the bot can post to |

Times are rendered with Discord's `<t:…>` markup, so every member sees them in
their own timezone — worth knowing for an alliance spread across regions.

---

## Local development

```bash
# Postgres is not reachable from outside the LAN, so tunnel to it:
ssh -fN -L 15432:127.0.0.1:5432 xronocore

cd backend
python3 -m venv .venv && ./.venv/bin/pip install -e ".[dev]"
cp .env.example .env && $EDITOR .env      # DATABASE_URL host 127.0.0.1:15432
./.venv/bin/alembic upgrade head
./.venv/bin/python -m dwsbot.main

cd ../frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

For frontend-only work you can run just the API without a Discord token:

```bash
./.venv/bin/python -m uvicorn dwsbot.main:app --port 8000
```

Endpoints needing the gateway (`/channels`, `/roles`, `test`) return 503 in that
mode; everything else works.

Tests and lint:

```bash
cd backend
./.venv/bin/pytest -q
./.venv/bin/ruff check src tests
```

---

## Operations

```bash
kubectl logs -n dws-manager deploy/dws-manager -f
kubectl get pods -n dws-manager
curl https://dws-api.xronocore.qzz.io/health
```

`/health` reports database connectivity, gateway readiness and the number of
scheduled jobs. It is unauthenticated, because the Kubernetes probes call it.

**Announcement did not fire** — check `last_error` on the card in the
backoffice; a failed send is recorded there rather than being retried silently.
Then confirm the bot can still post to that channel via `/admin channels`.

**Schema changes** — edit `models.py`, then:

```bash
cd backend
./.venv/bin/alembic revision --autogenerate -m "what changed"
./.venv/bin/alembic upgrade head
```

Always read the generated migration before applying it; autogenerate does not
detect every change.

## Security notes

- Secrets live only in the Kubernetes secret and your local `.env`. Both are
  gitignored; `deploy/secret.example.yaml` is the committed template.
- The backoffice JWT lasts 12 hours and carries no privileges beyond the officer
  role check performed at login.
- Admin status is re-read from live guild roles on every login, so removing
  someone's officer role revokes their access at their next sign-in.
- Postgres currently listens on `0.0.0.0:5432`. The `dws_manager` role is
  restricted by `pg_hba.conf` to the pod and LAN ranges and rejected elsewhere,
  but if that port is reachable from the internet through your router, consider
  binding it to the LAN interface.
