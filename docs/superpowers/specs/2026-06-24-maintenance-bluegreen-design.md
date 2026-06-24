# Maintenance & Blue-Green Deployment Design
**Date:** 2026-06-24  
**Status:** Pending implementation

---

## 1. Problem

Site deploys and DB maintenance cause full downtime. Plugin API calls fail silently with no retry or queue - patron visits, sales, and clock events during that window are permanently lost. No maintenance page exists. No safe deployment path exists that keeps the site live during a build.

---

## 2. Scope

Five deliverables:

1. **Blue-green deploy** - build new container while old serves, flip cloudflared, ~5-10s user-facing gap
2. **Maintenance mode** - nginx container serves a static page when flipped on
3. **Maintenance page** - layout C status list, XIV blue design, stop-slop copy
4. **XIV-admin panel** - `MaintenancePanel` for TUI control
5. **XIV-app admin** - wire `/admin/feedback` into nav + add `/admin/maintenance` page

---

## 3. Architecture

### Ingress

Traffic reaches the server via Cloudflare Tunnel (`cloudflared` container). The local config at `/home/server/cloudflared-config.yml` is bind-mounted into the container and is the sole routing source of truth. DNS CNAMEs on the Cloudflare dashboard are permanent and never change. Editing the config file and restarting `cloudflared` is the flip mechanism.

Traefik config files exist on disk but no Traefik container runs. They are inert.

### Port assignment

| Port | Container | State |
|---|---|---|
| 3000 | `venue-manager` (blue) | Always running |
| 3007 | Staging slot | Green build OR maintenance page, never both |

All ports 3001-3006 are occupied. 3007 is confirmed free.

### Two operating modes

**Mode A - Code deploy (blue-green)**

```
1. Build new image locally, push to server
2. docker compose --profile green up -d venue-manager-next   (starts on :3007)
3. Health check :3007/api/health until 200
4. sed cloudflared-config.yml: 3000 → 3007
5. docker restart cloudflared                                 (~5-10s user gap)
6. Verify xivvenuemanager.com responds
7. docker stop venue-manager
8. docker rename venue-manager-next venue-manager
9. Reconfigure venue-manager port back to 3000, restart
10. sed cloudflared-config.yml: 3007 → 3000
11. docker restart cloudflared                                (~5-10s user gap)
```

Note: step 9-11 is optional cleanup. The site runs on 3007 until next deploy, at which point the cycle reverses. A `ACTIVE_PORT` file on the server tracks which slot is live to avoid confusion.

**Mode B - Planned maintenance (hard stop)**

```
1. maintenance.sh on "reason"
   a. GET /api/plugin/events/active → abort if any active
   b. docker compose --profile maintenance up -d maintenance-page  (:3007)
   c. sed cloudflared-config.yml: current_port → 3007
   d. docker restart cloudflared
   e. Discord webhook: maintenance started
2. Do DB work / migrations
3. maintenance.sh off
   a. docker compose up -d venue-manager  (or start whichever slot is correct)
   b. Health check
   c. sed cloudflared-config.yml: 3007 → active_port
   d. docker restart cloudflared
   e. docker stop maintenance-page
   f. Discord webhook: maintenance ended
```

---

## 4. Plugin + Site Behavior During Flip

Plugin HTTP timeout is 10 seconds. cloudflared restart takes 5-10 seconds. Any in-flight plugin request during the restart hits `HttpRequestException`, is caught, and returns empty or `{Success: false}`. No queuing, no retry - that request is dropped.

Both plugin and website use `xivvenuemanager.com`. The flip is transparent to both after the restart completes. No plugin restart or config change is needed.

For **code deploys**, the 5-10s gap is the full user impact. Acceptable with advance Discord notice.

For **DB maintenance**, the maintenance page runs for the duration. Patron visits and sales during that window are lost - this is why timing matters.

---

## 5. Maintenance Window

**Tuesday 09:00-11:00 UTC (recommended default)**

The database has 24 registered venues, all marked `isActive = true`. Only 3 have event history:

- Ninja's Hideaway: Fridays 18:00-19:00 UTC
- The Final Act: Saturdays 16:00-18:00 UTC
- Velvet Rift: sporadic, Sat 23:00 / Mon 15:00 UTC

Cross-referencing venue-declared opening hours from `venue.settings` (openNights + defaultHours fields) confirms Tuesday 09:00 UTC is safe:

| Venue | Declared hours | UTC window |
|---|---|---|
| Catsune Cabaret | Sun 8pm-12am EST | Mon 01:00-05:00 UTC |
| MERO MERO | Sat 2am | ~Sat 07:00 UTC |
| MYRRHA | Wed 6-8pm | ~Wed 23:00-01:00 UTC |
| Midara's Mirage | Sun 2am | ~Sun 07:00 UTC |
| Moonlight Fae | Sat 6-10pm PDT | Sun 01:00-05:00 UTC |
| **Paradoxx** | **Mon 9pm-2am EST** | **Tue 02:00-07:00 UTC** |
| The Final Act | Sat 5-11pm | Sat 22:00-04:00 UTC |
| The Pantheon | 24/7 (without staff) | No active shifts |
| Velvet Rift | Sat 6pm-12am | ~Sat 23:00-05:00 UTC |

Paradoxx is the only venue with any Tuesday overlap. They close by 07:00 UTC at the latest. The 09:00 UTC start gives a 2-hour buffer after close. No venue lists Tuesday daytime as an operating window.

15 venues have no declared hours. Their operating times are unknown. The real-time active-events check covers these.

**The real guard is the active-events check in `maintenance.sh`.** The window is a convention. The script aborts if `/api/plugin/events/active` returns anything running, regardless of day or time. This is the hard protection.

Hard no-go zone regardless of type: Friday-Saturday 16:00-21:00 UTC.

---

## 6. docker-compose.yml Changes

Add two services with Docker Compose profiles so they don't start with `docker compose up`:

```yaml
venue-manager-next:
  build:
    context: .
    dockerfile: apps/web/Dockerfile
  container_name: venue-manager-next
  ports:
    - "3007:3000"
  env_file: .env
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  restart: "no"
  networks:
    - app-network
  profiles:
    - green

maintenance-page:
  image: nginx:alpine
  container_name: maintenance-page
  ports:
    - "3007:80"
  volumes:
    - ./docker/maintenance:/usr/share/nginx/html:ro
  restart: "no"
  profiles:
    - maintenance
```

---

## 7. Scripts

### ~/bin/maintenance.sh

```
maintenance.sh on [reason]   - enable maintenance mode
maintenance.sh off           - restore site
maintenance.sh status        - show current state
```

Logic for `on`:
- Read `ACTIVE_PORT` file (default 3000)
- curl /api/plugin/events/active on the active port - exit 1 if any running
- Start maintenance-page container on 3007
- sed cloudflared config: ACTIVE_PORT → 3007
- docker restart cloudflared
- Write `MAINTENANCE_REASON` and timestamp to state file
- POST Discord webhook

Logic for `off`:
- Read `ACTIVE_PORT` file
- Health check ACTIVE_PORT
- sed cloudflared config: 3007 → ACTIVE_PORT
- docker restart cloudflared
- Stop maintenance-page container
- POST Discord webhook

### ~/bin/deploy-xiv-web.sh (updated)

Add `--green` flag. Without it, current behavior (direct rebuild on :3000) stays intact for fast deploys when downtime is acceptable.

With `--green`:
1. Build new image
2. Start venue-manager-next on 3007
3. Poll /api/health on 3007 (30s timeout)
4. Flip cloudflared to 3007
5. Wait for confirmation
6. Stop old container
7. Update ACTIVE_PORT file

---

## 8. Maintenance Page

**File:** `~/xiv-app/docker/maintenance/index.html`  
**Served by:** nginx:alpine container on :3007  

### Copy (stop-slop applied)

**Title:** Scheduled Maintenance

**Subtitle:** The site is offline. Back by [ETA].

**Status rows:**

| Feature | Badge | Description |
|---|---|---|
| Clock-in / Clock-out | Offline | Fails with an in-game error. Don't start or end shifts now. |
| Patron Visit Logging | Offline | Visits during this window won't be recorded and can't be recovered. |
| Sale! Logging | Offline | Sales logged now won't be recorded. |
| DTR Bar / Shift Info | Stale | Shows last-known shift status. Updates when the site returns. |
| Plugin connection | Auto-restores | No restart needed. The plugin reconnects when the site comes back. |

**Footer:** Maintenance runs Tuesdays 09:00-11:00 UTC. Check Discord for live updates.

**Discord link:** visible in footer

---

## 9. XIV-Admin TUI: New Panels

Two new panels added to the xiv-admin TUI (`~/xiv-admin`). Both follow the `DeployPanel` pattern - SSH commands, `LogViewer` widget, `ConfirmModal` for destructive actions, `@work(thread=True)` for blocking calls.

### MaintenancePanel

**File:** `~/xiv-admin/xiv_admin/panels/maintenance.py`

Components:
- Status label: `LIVE :3000` or `MAINTENANCE :3007` (polled every 10s via SSH)
- Active events indicator: count from `/api/plugin/events/active` (warns before enabling)
- Buttons: `Enable Maintenance`, `Disable Maintenance`, `Check Active Events`, `Green Deploy`
- `ConfirmModal` guard on Enable Maintenance
- `LogViewer` streaming script output
- Calls `maintenance.sh on|off|status` and `deploy-xiv-web.sh --green` on the server via SSH

### FeedbackPanel

**File:** `~/xiv-admin/xiv_admin/panels/feedback.py`

Reads the `feedback` table directly via the DB connection (`xiv_admin/db.py` pattern). Mirrors what `/admin/feedback` shows in the web app.

Components:
- `DataTable` listing submissions: category, status, message preview, submitted_at
- Row selection → detail pane showing full message
- Status toggle buttons: `Mark Reviewed`, `Mark Resolved`, `Mark Dismissed`
- Filter buttons: `All`, `Pending`, `Reviewed` (filters the DataTable in-place)
- Auto-refreshes every 60s

Uses existing `db.py` psycopg2 connection. No SSH needed - reads DB directly.

### Registration

Both panels registered in `~/xiv-admin/xiv_admin/main.py` alongside `DeployPanel`. Tab order: Dashboard → Deploy → **Maintenance** → **Feedback** → Containers → Database → Errors → Logs → SSL → Email → Hermes → Integrations.

---

## 10. Implementation Order

1. docker-compose.yml - add profiles, maintenance-page service
2. docker/maintenance/index.html - maintenance page HTML
3. ~/bin/maintenance.sh - core flip script
4. ~/bin/deploy-xiv-web.sh --green flag
5. XIV-admin MaintenancePanel
6. XIV-admin FeedbackPanel

---

---

## 11. Out of Scope

- Plugin-side event queuing (significant C# work, deferred)
- Cloudflare Load Balancer (paid feature, not needed)
- Automated maintenance scheduling / cron triggers
- Zero-downtime DB migrations (current volume doesn't justify it)
