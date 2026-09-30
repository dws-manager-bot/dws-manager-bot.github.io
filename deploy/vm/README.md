# The backend on Google Cloud

Since 30 Sep 2026 the backend runs on one Google Cloud free-tier VM, not the
home k3s cluster. The home deployment is scaled to 0 and its database kept,
untouched, as a copy of the data at the moment of the move.

| | |
|---|---|
| Project | `dws-manager-prod`, billing account `xronace-billingacc` |
| VM | `dws-manager`, e2-micro (2 shared vCPU, 1 GB), `us-west1-b`, Debian 13 |
| Disk | 30 GB `pd-standard` — the free type; "balanced", the console default, is billed |
| Memory | 2 GB swap, `vm.swappiness=10`; the OS inventory agent and exim4 are disabled |
| Tunnel | `dws-manager-gcp` (`aa4226e2-…`), carrying `dws-api.xronocore.qzz.io` only |
| Budget | "free tier guard", 1,500 KRW, emails at 50% and 100% — an alert, not a cap |

Everything lives in `/opt/dws-manager` on the VM:

```
compose.yaml             this directory's compose.yaml
app.env                  the app's settings (root, 0600) — never committed
.env                     DB_PASSWORD for Postgres (root, 0600) — never committed
cloudflared/config.yml   this directory's cloudflared/config.yml
cloudflared/credentials.json   the tunnel's key (uid 65532, 0600) — never committed
backups/                 home-2026-09-30.dump, the database as it was moved
```

`app.env` has the keys of `deploy/secret.example.yaml`, with `DATABASE_URL`
pointing at the compose service: `postgresql+asyncpg://dws_manager:…@db:5432/dws_manager`.
The image is private; `/root/.docker/config.json` holds the ghcr pull login.

## One app container

A second one opens a second Discord gateway session and every scheduled
announcement posts twice. So: never `--scale app=2`, and never start the home
deployment while this one runs. `docker compose up -d` stops the old container
before it starts the new one, so a redeploy never overlaps.

## Everyday commands

All of these run on the VM, in `/opt/dws-manager`. To get there:

```bash
gcloud compute ssh dws-manager --project=dws-manager-prod --zone=us-west1-b
cd /opt/dws-manager
```

**Deploy a new backend image** — after the "Build and push bot image" workflow
finishes. Pushing the image does not restart anything:

```bash
sudo docker compose pull app && sudo docker compose up -d app
```

or in one go from the Mac:

```bash
gcloud compute ssh dws-manager --project=dws-manager-prod --zone=us-west1-b \
  --command='cd /opt/dws-manager && sudo docker compose pull app && sudo docker compose up -d app'
```

Migrations run as the container starts (`alembic upgrade head`).

**Logs, state, resources:**

```bash
sudo docker compose logs -f app
sudo docker compose ps
sudo docker stats --no-stream
```

**Change a setting** (a new Pages domain means `CORS_ORIGINS` and `FRONTEND_URL`):
edit `app.env` with `sudo`, then `sudo docker compose up -d app`. A plain
`restart` does not re-read the file.

**The database:**

```bash
sudo docker compose exec db psql -U dws_manager
sudo docker compose exec -T db pg_dump -Fc -U dws_manager dws_manager > dws_manager.dump
```

**Outbound traffic.** The free tier covers 1 GB a month out of the VM. Bytes
sent since the last boot:

```bash
cat /sys/class/net/ens4/statistics/tx_bytes
```

The site's own files are served by GitHub Pages and cost the VM nothing; what
goes out is API responses, the live-editing socket, and images posted to
Discord. The home pod sent 23 MB on the War planner's busiest day.

## Going back home

Should the VM fail, the home cluster still has everything but fresh data:

```bash
# on the VM: stop the bot first — never two
sudo docker compose stop app
sudo docker compose exec -T db pg_dump -Fc -U dws_manager dws_manager > latest.dump
# restore latest.dump into the home database, then:
kubectl scale deployment/dws-manager -n dws-manager --replicas=1
cloudflared tunnel route dns --overwrite-dns xronocore-k8s dws-api.xronocore.qzz.io
```

The home tunnel's config still lists `dws-api`, so the route is all it needs.
