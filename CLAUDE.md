# Working on this repo

`README.md` covers what the thing is and how to set it up. This file is the
part that is not obvious from reading the code: the rules that, if broken,
break production quietly.

## Hard invariants

**`replicas: 1`, `strategy: Recreate`.** One process holds the Discord gateway
session. A second replica opens a second session and every scheduled
announcement posts twice. The rolling default would briefly overlap two pods,
which is the same bug for thirty seconds.

**Discord snowflakes cross JSON as strings.** They exceed
`Number.MAX_SAFE_INTEGER`, so `Number(id)` silently rounds to a channel that
does not exist. `schemas.Snowflake` serialises to a string; the frontend must
never coerce one.

**Business rules go on `AnnouncementCreate`, never `AnnouncementBase`.**
`AnnouncementOut` inherits the base, so a rule like "run_at must be in the
future" — true of new input, false of a row stored last week — turns every
read of that row into a 500. There is a regression test for exactly this.

**Return 4xx for application errors, not 5xx.** Cloudflare replaces a 5xx body
with its own error page and drops the CORS headers, so the real message never
reaches the browser. A conflict the user can act on is a 409.

**Cron day-of-week is translated, not passed through.** APScheduler numbers
Monday as 0; crontab and croniter number Sunday as 0. `cron.py` rewrites the
field to names, which both agree on. Never call `CronTrigger.from_crontab`.

**Your local `.env` points at the production database.** `alembic upgrade head`
run locally migrates production. This has happened twice. Both times the change
was additive and nullable, so nothing broke — do not rely on that a third time.

**`.gitignore` lists `deploy/secret.yaml` explicitly.** `*.secret.yaml` does not
match a file named `secret.yaml`. Real credentials were one `git add -A` from
being committed before that line existed.

## Time

Game server time (**ST**) is `Etc/GMT+2`, which is UTC−2 with no daylight
saving. `00:00 ST = 11:00 KST`. The Etc zones invert the sign; this is correct.

Every time in the app is a **wall-clock time read against the timezone stored on
the row**. `frontend/src/lib/tz.js` is the only place that conversion happens —
`zonedToIso` and `utcToZoned`. Never write `new Date(localString).toISOString()`
in a page or component: that silently means "wherever this browser is", which is
the bug that made the same 09:00 three different moments across three forms.

Two deliberate exceptions: an interval has no zone, because elapsed minutes have
none; an event-linked announcement takes the event's zone.

## Schedule kinds

`cron` · `interval` · `rotation` · `once` · `event`. `rotation` is every N days
counted from `run_at`, which is the first post and the anchor — the whole reason
it is not a bare interval, which would count from whenever the process last
loaded the job and walk off its weekday after any restart. It stores the period
in `interval_minutes` as whole days.

`kind` is a plain `VARCHAR(16)` with no check constraint, so adding a kind needs
no migration.

## Pass War geometry

Shelters are 3×3, portals 2×2. A shelter block an odd number of tiles across or
deep therefore **cannot** be ringed exactly — one tile is left over, and no
placement removes it. Moving it only breaks it into more, smaller gaps at the
formation's corners. It is drawn as kept clear (`g.CHANNELS`) and the Layout
card offers the even grid that avoids it. Do not "fix" this again.

Rings grow from `FRAME_*`, the block rounded out to even sides, so each ring
tiles exactly and corners fall out of the same loop. The earlier bug was
stepping across the block's own odd width, which overran the right-hand column
and silently dropped whole portals.

Portals build outward until the target count is met; the ring the target runs
out inside is filled nearest-the-pass first, so an unfinished formation is open
at the rear rather than ragged all round.

There is an invariant checker worth re-running after any geometry change: build
plans across versions, grids, lean, target, camp and gate, and assert no tile is
ever enclosed on all four sides by structures and the count never overruns.

## Deploying

Two workflows, both on push to `main`, both path-filtered:

- `frontend/**` → Pages. Live in about a minute.
- `backend/**` → builds and pushes `ghcr.io/dws-manager-bot/dws-manager-bot:latest`.
  **Pushing the image does not restart anything.** The rollout is manual:

```bash
ssh -f -N xronocore-cf-k8s          # forwards 6443 over the Cloudflare SSH host
kubectl rollout restart deployment/dws-manager -n dws-manager
kubectl rollout status  deployment/dws-manager -n dws-manager
pkill -f 'ssh.*xronocore-cf-k8s'    # close it again afterwards
```

Verify from outside afterwards — no tunnel needed:

```bash
curl -s https://dws-api.xronocore.qzz.io/health
curl -s https://dws-api.xronocore.qzz.io/openapi.json | jq '.components.schemas.ScheduleKind.enum'
```

A frontend change that depends on a backend change will 422 in the window
between the two deploys. Ship the backend first, or say so plainly.

## Verifying frontend work

`npm run build` catches syntax, not layout. Headless Chrome clamps its viewport
to 500px, so screenshot **through fixed-width iframes** to see real breakpoints.
The pages need auth, so a static harness with the built CSS and the real class
names is usually the fastest honest check. Verify the live bundle after
deploying by grepping it for the strings you added.

Design system is pou-rocks: zinc surfaces, gold accent, mobile-first. Check at
360–390px. 44px touch targets, 16px inputs so iOS does not zoom, `min-width: 0`
on grid and flex children.

## Working style

Build, report, and **wait**. Commit only when the user says to ship it. Stage
file by file and check `git diff --cached --stat` before committing — a second
Claude session has shared this working tree before and swept up an in-progress
edit.
