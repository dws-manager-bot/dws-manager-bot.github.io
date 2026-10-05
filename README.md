# DWS Alliance Manager

A Discord bot and web backoffice for running a **Dark War Survival** alliance:
scheduled announcements, a recurring event calendar with signups, and a Pass
Occupation War map planner — all configurable from a browser instead of by
editing code.

```
GitHub Pages  ──  pou.actuallyplaying.com                  static backoffice (HTTPS)
      │           Discord OAuth2 login → short-lived JWT
      ▼
https://dws-api.xronocore.qzz.io                            Cloudflare tunnel, edge TLS
      │
      ▼
Google Cloud e2-micro `dws-manager`, Docker Compose         one app container
   FastAPI (REST)  +  discord.py (gateway)  +  APScheduler
      │
      ▼
PostgreSQL 16, compose service `db`                         database `dws_manager`
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
client secret exist only in `app.env` on the VM. Login runs server-side:
Discord redirects to the API, the API verifies the caller actually holds an
admin role in the guild, and only then issues a JWT.

## Repository layout

```
backend/          FastAPI + discord.py + APScheduler (one process)
  src/dwsbot/
    main.py         entrypoint — runs the API and the bot in one event loop
    models.py       SQLAlchemy models
    scheduler.py    rebuilds APScheduler jobs from the database
    recurrence.py   rotation / weekday maths (pure, unit tested)
    cron.py         crontab -> APScheduler day-of-week translation
    occurrences.py  applies per-date moves and skips to a rule
    servertime.py   game server time (Etc/GMT+2)
    security.py     Discord OAuth2 + JWT
    api/routers/    REST endpoints
    discord_bot/    the client and its slash-command cogs
  migrations/     Alembic
frontend/         Vite + React backoffice → GitHub Pages
  src/lib/tz.js     the only wall-clock <-> instant conversion in the app
  src/passwar/      Pass War map engine (canvas) and its data layer
deploy/vm/        the VM's Compose project and tunnel config (production)
deploy/*.yaml     the retired home k3s manifests
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

### 2–4. Run the backend

The backend, its Postgres and its Cloudflare tunnel run as one Docker Compose
project on a Google Cloud free-tier VM. `deploy/vm/README.md` covers the machine,
the files beside `compose.yaml` that are never committed, deploying a new
image, and the way back.

The container runs `alembic upgrade head` at start-up, which is safe because
there is only ever one app container.

> **One app container, ever.** A second opens a second gateway session and
> posts every scheduled announcement twice.

Until 30 Sep 2026 the backend ran on the home k3s cluster. `deploy/*.yaml` are
those manifests, kept for the way back and scaled to `replicas: 0`; the home
database is kept, untouched, from the day of the move.

### 5. Publish the backoffice

In the GitHub repo: **Settings → Pages → Source: GitHub Actions**, and set
repository variable `VITE_API_URL` to `https://dws-api.xronocore.qzz.io`.

The repo is named `dws-manager-bot.github.io` inside the org of the same
name, which makes it an *organization site* served from the domain root.
That is why Vite's `base` is `/` rather than a repo subpath.

It is served on the custom domain `pou.actuallyplaying.com` (**Settings → Pages →
Custom domain**), and `dws-manager-bot.github.io` redirects there.

Pushing to `main` builds and publishes it. The API's `CORS_ORIGINS` must include
the address the site is actually served from — the custom domain — and
`FRONTEND_URL` should be that address too.

---

## Using it

### Backoffice

Sign in with Discord. Who gets in depends on the account's roles in the guild:

| | Roles | Sees |
| --- | --- | --- |
| Admin | `ADMIN_ROLES` (default `Beasts,R5`), or the guild owner | Alliance and Admin pages |
| Member | `MEMBER_ROLES` (default `Members`) | Alliance pages |
| Anyone else | a Guest, or no role | nothing: the login is refused |

Alliance pages live at the root (`/pass-war`), admin pages under `/admin/`.
Every page has its own address, so a link can be shared, and signing in comes
back to the page that was opened.

- **Set up** — a three-step wizard: define an event, attach an announcement to
  it, review and create both. The fastest path from nothing to a working post.
- **Announcements** — schedule recurring posts. Five schedule types: cron,
  every-N-days, every-N-minutes, one-time, or *N minutes before an event*. The
  builder writes the expression and previews the dates it actually produces, so
  a schedule is never taken on trust. "Send test" delivers immediately without
  touching the schedule. A channel picker inserts Discord's `<#id>` link syntax
  into the message body.
- **Events** — define recurring game events on fixed weekdays, an N-day
  rotation, or explicit dates. "Manage dates" moves or skips a single occurrence
  without touching the rule, and a reason given there is appended to the post.
- **History** — who created or last changed each announcement and event.
- **Pass War map** — plan the Pass Occupation War formation: shelter grid,
  portal count, gate position, camp size, and a drag-ordered line-up that
  decides who holds the slots nearest the pass. An Alliance page, readable by
  every member; only admins can save a draft or publish the official plan.
  Exports a PNG.

Every time entered anywhere in the backoffice is a wall-clock time read against
a timezone you pick on the same form — `Etc/GMT+2` is game server time.

### Slash commands

| Command | Who | Purpose |
| --- | --- | --- |
| `/events next` | anyone | Upcoming events, in each viewer's timezone |
| `/events post <key>` | anyone | Post a signup sheet with buttons |
| `/admin announcements` | admins | List schedules and next fire times |
| `/admin test <id>` | admins | Send one announcement now |
| `/admin reload` | admins | Rebuild the schedule from the database |
| `/admin channels` | admins | List channel IDs the bot can post to |

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
gcloud compute ssh dws-manager --project=dws-manager-prod --zone=us-west1-b
cd /opt/dws-manager
sudo docker compose logs -f app
sudo docker compose ps
curl https://dws-api.xronocore.qzz.io/health
```

`/health` reports database connectivity, gateway readiness and the number of
scheduled jobs. It is unauthenticated, because the container's health check
calls it.

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

- Secrets live only in `app.env` on the VM and your local `.env`. Neither is
  committed; `deploy/secret.example.yaml` is the template for the keys.
- The backoffice JWT lasts 12 hours and carries no privileges beyond the admin
  role check performed at login.
- Admin status is re-read from live guild roles on every login, so removing
  someone's admin role revokes their access at their next sign-in.
- Postgres currently listens on `0.0.0.0:5432`. The `dws_manager` role is
  restricted by `pg_hba.conf` to the pod and LAN ranges and rejected elsewhere,
  but if that port is reachable from the internet through your router, consider
  binding it to the LAN interface.
