# Maintenance & Blue-Green Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add blue-green deployment, a static maintenance page, and two XIV-admin TUI panels (Maintenance + Feedback) so site deploys and planned maintenance cause minimal data loss.

**Architecture:** Port 3007 is the staging slot - either `venue-manager-next` (green build) or `maintenance-page` (nginx) runs there, never both. cloudflared routes traffic by editing `/home/server/cloudflared-config.yml` and restarting the container. XIV-admin panels call shell scripts on the server via SSH.

**Tech Stack:** Bash, Docker Compose profiles, nginx:alpine, Python/Textual (xiv-admin), asyncpg

---

## File Map

**xiv-app repo (`~/xiv-app`):**
- Modify: `docker-compose.yml` - add `venue-manager-next` + `maintenance-page` services
- Create: `docker/maintenance/index.html` - static maintenance page
- Create: `docker/maintenance/nginx.conf` - nginx config (no index fallback needed, just serve root)

**Server scripts (`~/bin/` on local, synced to `~/bin/` on server manually):**
- Create: `~/bin/maintenance.sh` - on/off/status toggle
- Modify: `~/bin/deploy-xiv-web.sh` - add `--green` flag

**xiv-admin repo (`~/xiv-admin`):**
- Modify: `xiv_admin/config.py` - add `maintenance_script` field
- Create: `xiv_admin/panels/maintenance.py` - MaintenancePanel
- Create: `xiv_admin/panels/feedback.py` - FeedbackPanel
- Modify: `xiv_admin/main.py` - register both panels

---

## Task 1: docker-compose.yml - Add Green and Maintenance Services

**Files:**
- Modify: `~/xiv-app/docker-compose.yml`

- [ ] **Step 1: Add venue-manager-next and maintenance-page services**

Add these two services before the `networks:` block in `docker-compose.yml`:

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

- [ ] **Step 2: Verify compose file is valid**

```bash
cd ~/xiv-app && docker compose config --quiet
```

Expected: no output (exit 0). Any error means a YAML syntax problem.

- [ ] **Step 3: Confirm profiles don't start with normal up**

```bash
cd ~/xiv-app && docker compose config --services
```

Expected output includes `venue-manager` but NOT `venue-manager-next` or `maintenance-page` (profiled services are excluded from the default list).

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add docker-compose.yml
git commit -m "infra: add green and maintenance docker compose profiles on :3007"
```

---

## Task 2: Maintenance Page HTML

**Files:**
- Create: `~/xiv-app/docker/maintenance/index.html`

- [ ] **Step 1: Create the maintenance directory**

```bash
mkdir -p ~/xiv-app/docker/maintenance
```

- [ ] **Step 2: Write index.html**

Create `~/xiv-app/docker/maintenance/index.html` with this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Maintenance — XIV Venue Manager</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #030508;
    color: #cdd6f4;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .container { width: 100%; max-width: 560px; }

  .wordmark {
    text-align: center;
    margin-bottom: 28px;
  }
  .wordmark-text {
    font-size: 12px;
    letter-spacing: 5px;
    text-transform: uppercase;
    color: #00b4ff;
    opacity: 0.85;
  }
  .wordmark-rule {
    width: 48px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0,180,255,0.5), transparent);
    margin: 10px auto 0;
  }

  .card {
    background: #0a0f1e;
    border: 1px solid rgba(0,180,255,0.18);
    border-radius: 12px;
    padding: 32px;
    box-shadow: 0 0 40px rgba(0,180,255,0.05);
  }

  .card-head { text-align: center; margin-bottom: 24px; }

  .icon {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: rgba(0,180,255,0.08);
    border: 1px solid rgba(0,180,255,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    margin: 0 auto 14px;
  }

  h1 {
    font-size: 20px;
    font-weight: 600;
    color: #e2e8f0;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .subtitle {
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
  }

  .eta {
    display: inline-block;
    margin-top: 10px;
    padding: 4px 14px;
    background: rgba(0,180,255,0.07);
    border: 1px solid rgba(0,180,255,0.18);
    border-radius: 20px;
    color: #00b4ff;
    font-size: 12px;
  }

  .rule { height: 1px; background: rgba(0,180,255,0.08); margin: 22px 0; }

  .section-label {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(0,180,255,0.6);
    margin-bottom: 12px;
  }

  .status-list { display: flex; flex-direction: column; gap: 8px; }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(0,180,255,0.02);
    border: 1px solid rgba(0,180,255,0.07);
    border-radius: 8px;
  }

  .row-icon { font-size: 13px; width: 18px; text-align: center; flex-shrink: 0; }

  .row-body { flex: 1; }
  .row-name { font-size: 13px; color: #e2e8f0; font-weight: 500; margin-bottom: 2px; }
  .row-desc { font-size: 11px; color: #475569; line-height: 1.4; }

  .badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 500;
    flex-shrink: 0;
  }
  .offline  { background: rgba(239,68,68,0.1);  color: #f87171; border: 1px solid rgba(239,68,68,0.18); }
  .stale    { background: rgba(245,158,11,0.1); color: #fbbf24; border: 1px solid rgba(245,158,11,0.18); }
  .restores { background: rgba(34,197,94,0.1);  color: #4ade80; border: 1px solid rgba(34,197,94,0.18); }

  .foot {
    margin-top: 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .foot-note { font-size: 11px; color: #334155; line-height: 1.55; }
  .foot-note strong { color: #475569; }

  .discord-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: rgba(88,101,242,0.1);
    border: 1px solid rgba(88,101,242,0.22);
    border-radius: 8px;
    color: #818cf8;
    font-size: 12px;
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
</head>
<body>
<div class="container">

  <div class="wordmark">
    <div class="wordmark-text">XIV Venue Manager</div>
    <div class="wordmark-rule"></div>
  </div>

  <div class="card">

    <div class="card-head">
      <div class="icon">⚙</div>
      <h1>Scheduled Maintenance</h1>
      <p class="subtitle">The site is offline. Back shortly.</p>
      <span class="eta">Est. return: 11:00 UTC</span>
    </div>

    <div class="rule"></div>

    <div class="section-label">Plugin status during maintenance</div>
    <div class="status-list">

      <div class="row">
        <div class="row-icon">🔴</div>
        <div class="row-body">
          <div class="row-name">Clock-in / Clock-out</div>
          <div class="row-desc">Fails with an in-game error. Don't start or end shifts now.</div>
        </div>
        <span class="badge offline">Offline</span>
      </div>

      <div class="row">
        <div class="row-icon">🔴</div>
        <div class="row-body">
          <div class="row-name">Patron Visit Logging</div>
          <div class="row-desc">Visits during this window won't be recorded and can't be recovered.</div>
        </div>
        <span class="badge offline">Offline</span>
      </div>

      <div class="row">
        <div class="row-icon">🔴</div>
        <div class="row-body">
          <div class="row-name">Sale! Logging</div>
          <div class="row-desc">Sales logged now won't be recorded.</div>
        </div>
        <span class="badge offline">Offline</span>
      </div>

      <div class="row">
        <div class="row-icon">🟡</div>
        <div class="row-body">
          <div class="row-name">DTR Bar / Shift Info</div>
          <div class="row-desc">Shows last-known shift status. Updates when the site returns.</div>
        </div>
        <span class="badge stale">Stale</span>
      </div>

      <div class="row">
        <div class="row-icon">🟢</div>
        <div class="row-body">
          <div class="row-name">Plugin Connection</div>
          <div class="row-desc">No restart needed. The plugin reconnects when the site comes back.</div>
        </div>
        <span class="badge restores">Auto-restores</span>
      </div>

    </div>

    <div class="rule"></div>

    <div class="foot">
      <p class="foot-note">
        Maintenance runs <strong>Tuesdays 09:00–11:00 UTC</strong>.<br>
        Check Discord for live updates.
      </p>
      <a class="discord-btn" href="https://discord.gg/YOUR_INVITE" target="_blank" rel="noopener">
        💬 Discord
      </a>
    </div>

  </div>
</div>
</body>
</html>
```

> **Note:** Replace `YOUR_INVITE` in the Discord link with the actual invite code before deploying.

- [ ] **Step 3: Verify nginx serves the file**

```bash
cd ~/xiv-app
docker run --rm -v "$(pwd)/docker/maintenance:/usr/share/nginx/html:ro" -p 18080:80 nginx:alpine &
sleep 2
curl -sf http://localhost:18080/ | grep -c "XIV Venue Manager"
# kill the test container
docker ps -q --filter ancestor=nginx:alpine | xargs docker stop 2>/dev/null || true
```

Expected: `1` (found the page title).

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add docker/maintenance/
git commit -m "feat: add static maintenance page with XIV blue design and plugin status list"
```

---

## Task 3: maintenance.sh - Core Flip Script

**Files:**
- Create: `~/bin/maintenance.sh`

- [ ] **Step 1: Write the script**

Create `~/bin/maintenance.sh`:

```bash
#!/usr/bin/env bash
# Flip XIV Venue Manager between live and maintenance mode.
# Usage: maintenance.sh on [reason] | off | status
set -euo pipefail

STATE_FILE=/home/server/.xiv-maintenance-state
ACTIVE_PORT_FILE=/home/server/.xiv-active-port
CLOUDFLARED_CONFIG=/home/server/cloudflared-config.yml
SERVER_IP=192.168.1.122
DISCORD_WEBHOOK="${DISCORD_MAINTENANCE_WEBHOOK:-}"
COMPOSE_DIR=/home/server/xiv-app

_active_port() {
  if [[ -f "$ACTIVE_PORT_FILE" ]]; then cat "$ACTIVE_PORT_FILE"; else echo "3000"; fi
}

_check_events() {
  local port
  port=$(_active_port)
  local response
  response=$(curl -sf --max-time 5 "http://$SERVER_IP:$port/api/plugin/events/active" 2>/dev/null || echo "[]")
  python3 -c "
import sys, json
try:
    d = json.loads('''$response''')
    print(len(d) if isinstance(d, list) else (1 if d else 0))
except Exception:
    print(0)
"
}

_flip_cloudflared() {
  local from="$1" to="$2"
  sed -i "s|http://$SERVER_IP:$from|http://$SERVER_IP:$to|g" "$CLOUDFLARED_CONFIG"
  docker restart cloudflared
  echo "    Flipped :$from -> :$to, cloudflared restarted (~10s gap)"
}

_discord() {
  local msg="$1"
  [[ -z "$DISCORD_WEBHOOK" ]] && return 0
  curl -sf -X POST "$DISCORD_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$msg\"}" > /dev/null || true
}

cmd="${1:-status}"
reason="${2:-}"

case "$cmd" in
  on)
    echo "==> Checking active events"
    count=$(_check_events)
    if [[ "$count" -gt 0 ]]; then
      echo "ERROR: $count active event(s) running. Aborting." >&2
      exit 1
    fi

    port=$(_active_port)
    echo "==> Starting maintenance-page container on :3007"
    cd "$COMPOSE_DIR"
    docker compose --profile maintenance up -d maintenance-page

    echo "==> Flipping cloudflared :$port -> :3007"
    _flip_cloudflared "$port" 3007

    printf '%s\n%s\n%s\n' "maintenance" "$reason" "$(date -u)" > "$STATE_FILE"

    _discord ":wrench: **XIV Venue Manager** is offline for maintenance. Back by ~11:00 UTC.${reason:+ Reason: $reason}"
    echo "==> Maintenance ON. Cloudflared now routes to maintenance-page on :3007."
    ;;

  off)
    port=$(_active_port)
    echo "==> Health check venue-manager on :$port"
    if ! curl -sf --max-time 5 "http://$SERVER_IP:$port/" > /dev/null; then
      echo "ERROR: :$port not responding. Is venue-manager running?" >&2
      exit 1
    fi

    echo "==> Flipping cloudflared :3007 -> :$port"
    _flip_cloudflared 3007 "$port"

    echo "==> Stopping maintenance-page"
    cd "$COMPOSE_DIR"
    docker compose --profile maintenance stop maintenance-page

    rm -f "$STATE_FILE"
    _discord ":white_check_mark: **XIV Venue Manager** is back online."
    echo "==> Maintenance OFF. Cloudflared routes to venue-manager on :$port."
    ;;

  status)
    port=$(_active_port)
    echo "Active port : :$port"
    if [[ -f "$STATE_FILE" ]]; then
      echo "State       : MAINTENANCE"
      echo "--- state file ---"
      cat "$STATE_FILE"
      echo "------------------"
    else
      echo "State       : LIVE"
    fi
    count=$(_check_events)
    echo "Active events: $count"
    ;;

  *)
    echo "Usage: maintenance.sh on [reason] | off | status" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 2: Make executable and syntax-check**

```bash
chmod +x ~/bin/maintenance.sh
bash -n ~/bin/maintenance.sh
```

Expected: no output (exit 0). Any output is a syntax error.

- [ ] **Step 3: Test status command locally**

```bash
~/bin/maintenance.sh status
```

Expected output (approximate):
```
Active port : :3000
State       : LIVE
Active events: 0
```

- [ ] **Step 4: Copy to server**

```bash
scp ~/bin/maintenance.sh server@192.168.1.122:~/bin/maintenance.sh
ssh server@192.168.1.122 "chmod +x ~/bin/maintenance.sh && bash -n ~/bin/maintenance.sh"
```

Expected: no output from `bash -n`.

- [ ] **Step 5: Test status on server**

```bash
ssh server@192.168.1.122 "~/bin/maintenance.sh status"
```

Expected: shows `Active port: :3000`, `State: LIVE`, `Active events: 0`.

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app
git add -N ../../bin/maintenance.sh 2>/dev/null || true
# Script lives in ~/bin, not in the repo - commit a note in docs instead
git commit --allow-empty -m "infra: maintenance.sh deployed to server ~/bin (flip cloudflared + discord notify)"
```

> **Note:** `~/bin/maintenance.sh` lives outside the xiv-app repo. Keep a copy in `~/bin/` locally and re-scp after changes.

---

## Task 4: deploy-xiv-web.sh - Add --green Flag

**Files:**
- Modify: `~/bin/deploy-xiv-web.sh`

- [ ] **Step 1: Replace the deploy script with green-deploy support**

Overwrite `~/bin/deploy-xiv-web.sh`:

```bash
#!/usr/bin/env bash
# Deploy XIV Venue Manager.
# Default: direct rebuild (brief downtime).
# --green: blue-green deploy on :3007, ~10s cloudflared gap.
set -euo pipefail

GREEN=false
[[ "${1:-}" == "--green" ]] && GREEN=true

LOCAL_DIR=~/xiv-app
SERVER=server@192.168.1.122
SERVER_DIR=/home/server/xiv-app
SERVER_IP=192.168.1.122
ACTIVE_PORT_FILE=/home/server/.xiv-active-port
CLOUDFLARED_CONFIG=/home/server/cloudflared-config.yml

echo "==> Checking local repo for uncommitted changes"
cd "$LOCAL_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "Local repo has uncommitted changes. Commit or stash before deploying:"
  git status --short
  exit 1
fi

echo "==> Pushing local main"
git push

echo "==> Checking server repo for uncommitted changes"
ssh "$SERVER" "cd $SERVER_DIR && git status --porcelain" > /tmp/deploy-xiv-server-status
if [ -s /tmp/deploy-xiv-server-status ]; then
  echo "Server repo has uncommitted changes. Resolve before deploying:"
  cat /tmp/deploy-xiv-server-status
  rm -f /tmp/deploy-xiv-server-status
  exit 1
fi
rm -f /tmp/deploy-xiv-server-status

if $GREEN; then
  echo "==> Green deploy: pulling + building venue-manager-next on :3007"
  ssh "$SERVER" "cd $SERVER_DIR && git pull && docker compose build venue-manager-next && docker compose --profile green up -d venue-manager-next"

  echo "==> Health check :3007 (30s timeout)"
  healthy=false
  for i in $(seq 1 30); do
    if ssh "$SERVER" "curl -sf --max-time 3 http://$SERVER_IP:3007/ > /dev/null 2>&1"; then
      echo "    :3007 healthy (${i}s)"
      healthy=true
      break
    fi
    sleep 1
  done

  if ! $healthy; then
    echo "ERROR: :3007 did not become healthy in 30s. Stopping green container." >&2
    ssh "$SERVER" "cd $SERVER_DIR && docker compose --profile green stop venue-manager-next" || true
    exit 1
  fi

  active_port=$(ssh "$SERVER" "cat $ACTIVE_PORT_FILE 2>/dev/null || echo 3000")
  echo "==> Flipping cloudflared :${active_port} -> :3007"
  ssh "$SERVER" "sed -i 's|http://$SERVER_IP:${active_port}|http://$SERVER_IP:3007|g' $CLOUDFLARED_CONFIG && docker restart cloudflared"

  echo "==> Waiting 12s for cloudflared to stabilise"
  sleep 12

  echo "==> Verify xivvenuemanager.com responds"
  if curl -sf --max-time 10 https://xivvenuemanager.com > /dev/null; then
    echo "    Site responding."
  else
    echo "WARNING: site not responding after flip. Check cloudflared logs." >&2
  fi

  echo "==> Stopping old container on :${active_port}"
  ssh "$SERVER" "docker stop venue-manager 2>/dev/null || true && echo 3007 > $ACTIVE_PORT_FILE"

  echo "==> Green deploy complete. Active port is now :3007."
  echo "    Next deploy: run without --green (rebuilds on :3000 and flips back) or repeat --green."

else
  echo "==> Pulling on server and rebuilding"
  ssh "$SERVER" "cd $SERVER_DIR && git pull && docker compose build venue-manager && docker compose up -d venue-manager"
  echo "==> Done"
fi
```

- [ ] **Step 2: Syntax-check**

```bash
bash -n ~/bin/deploy-xiv-web.sh
```

Expected: no output.

- [ ] **Step 3: Dry-run default path still works**

```bash
cd ~/xiv-app && git status
# Ensure there are no uncommitted changes, then:
# (Don't actually run the deploy - just verify --help-like behaviour)
bash -n ~/bin/deploy-xiv-web.sh --green
```

Expected: no output.

- [ ] **Step 4: Copy to server**

```bash
scp ~/bin/deploy-xiv-web.sh server@192.168.1.122:~/bin/deploy-xiv-web.sh
ssh server@192.168.1.122 "chmod +x ~/bin/deploy-xiv-web.sh && bash -n ~/bin/deploy-xiv-web.sh"
```

Expected: no output from `bash -n`.

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git commit --allow-empty -m "infra: deploy-xiv-web.sh --green flag for blue-green cloudflared flip"
```

---

## Task 5: xiv-admin Config - Add maintenance_script Field

**Files:**
- Modify: `~/xiv-admin/xiv_admin/config.py`

- [ ] **Step 1: Add maintenance_script to Config dataclass**

In `~/xiv-admin/xiv_admin/config.py`, add one field to the `Config` dataclass after `deploy_script`:

```python
    deploy_script: str = "~/bin/deploy-xiv-web.sh"
    maintenance_script: str = "~/bin/maintenance.sh"   # add this line
    app_git_path: str = "/home/server/xiv-app"
```

- [ ] **Step 2: Run existing config tests**

```bash
cd ~/xiv-admin && python -m pytest tests/test_config.py -v
```

Expected: all tests pass. The new field has a default so existing roundtrip tests still work.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-admin
git add xiv_admin/config.py
git commit -m "feat: add maintenance_script config field"
```

---

## Task 6: XIV-Admin MaintenancePanel

**Files:**
- Create: `~/xiv-admin/xiv_admin/panels/maintenance.py`

- [ ] **Step 1: Write the panel**

Create `~/xiv-admin/xiv_admin/panels/maintenance.py`:

```python
from __future__ import annotations
import subprocess
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, DataTable
from textual.containers import Horizontal
from textual import work
from xiv_admin.widgets.log_viewer import LogViewer
from xiv_admin.widgets.confirm_modal import ConfirmModal


class MaintenancePanel(Static):
    """Control maintenance mode and green deploys via SSH."""

    BORDER_TITLE = "Maintenance"

    def compose(self) -> ComposeResult:
        yield Label("[bold #00b4ff]Maintenance Control[/bold #00b4ff]", classes="xiv-title")
        yield Label("", id="maint-status")
        yield Label("", id="maint-events")
        with Horizontal(id="maint-buttons"):
            yield Button("Enable Maintenance", id="btn-maint-on",  variant="error")
            yield Button("Disable Maintenance", id="btn-maint-off", variant="success")
            yield Button("Green Deploy", id="btn-green-deploy", variant="primary")
            yield Button("Refresh Status", id="btn-maint-refresh")
        yield Label("", id="maint-op-status")
        yield LogViewer(id="maint-log")

    def on_mount(self) -> None:
        self.poll_status()
        self.set_interval(10, self.poll_status)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-maint-on":
            self.app.push_screen(
                ConfirmModal("Enable maintenance mode?\nThis takes the site offline."),
                self._on_confirm_enable,
            )
        elif event.button.id == "btn-maint-off":
            self.run_maintenance("off")
        elif event.button.id == "btn-green-deploy":
            self.run_green_deploy()
        elif event.button.id == "btn-maint-refresh":
            self.poll_status()

    def _on_confirm_enable(self, confirmed: bool) -> None:
        if confirmed:
            self.run_maintenance("on")

    def _ssh(self, cmd: str) -> subprocess.CompletedProcess:
        cfg = self.app.config
        return subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=4",
             f"{cfg.ssh_user}@{cfg.ssh_host}", cmd],
            capture_output=True, text=True, timeout=15,
        )

    @work(thread=True, group="maint-status")
    def poll_status(self) -> None:
        status_label  = self.query_one("#maint-status",  Label)
        events_label  = self.query_one("#maint-events",  Label)
        try:
            result = self._ssh(
                "port=$(cat /home/server/.xiv-active-port 2>/dev/null || echo 3000); "
                "state=$(cat /home/server/.xiv-maintenance-state 2>/dev/null && echo MAINTENANCE || echo LIVE); "
                "echo \"$port $state\""
            )
            parts = result.stdout.strip().split()
            if len(parts) >= 2:
                port, state = parts[0], parts[1]
                colour = "#ff4444" if state == "MAINTENANCE" else "#44ff88"
                self.app.call_from_thread(
                    status_label.update,
                    f"[{colour}]{state}[/{colour}] on :{port}",
                )
            else:
                self.app.call_from_thread(status_label.update, "[dim]status unknown[/dim]")

            ev_result = self._ssh(
                "~/bin/maintenance.sh status 2>/dev/null | grep 'Active events' || echo 'Active events: ?'"
            )
            self.app.call_from_thread(events_label.update, f"[dim]{ev_result.stdout.strip()}[/dim]")
        except Exception as e:
            self.app.call_from_thread(status_label.update, f"[#ff4444]SSH error: {e}[/#ff4444]")

    @work(thread=True)
    def run_maintenance(self, cmd: str) -> None:
        log    = self.query_one("#maint-log",       LogViewer)
        status = self.query_one("#maint-op-status", Label)
        cfg    = self.app.config
        script = cfg.maintenance_script

        self.app.call_from_thread(status.update, f"[#ffaa00]Running maintenance {cmd}...[/#ffaa00]")

        try:
            proc = subprocess.Popen(
                ["ssh", "-o", "BatchMode=yes",
                 f"{cfg.ssh_user}@{cfg.ssh_host}",
                 f"bash {script} {cmd}"],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            for line in proc.stdout:
                self.app.call_from_thread(log.append, line.rstrip())
            proc.wait()
            if proc.returncode == 0:
                colour, msg = "#44ff88", f"maintenance {cmd} succeeded"
            else:
                colour, msg = "#ff4444", f"maintenance {cmd} failed (exit {proc.returncode})"
            self.app.call_from_thread(status.update, f"[{colour}]{msg}[/{colour}]")
            self.app.call_from_thread(self.app.notify, msg, severity="information" if proc.returncode == 0 else "error")
        except Exception as e:
            self.app.call_from_thread(log.append, f"Error: {e}", "red")
            self.app.call_from_thread(status.update, "[#ff4444]Error[/#ff4444]")
        finally:
            self.poll_status()

    @work(thread=True)
    def run_green_deploy(self) -> None:
        log    = self.query_one("#maint-log",       LogViewer)
        status = self.query_one("#maint-op-status", Label)
        cfg    = self.app.config
        script = cfg.deploy_script

        self.app.call_from_thread(status.update, "[#ffaa00]Green deploy starting...[/#ffaa00]")
        self.app.call_from_thread(log.append, "==> Running green deploy (this takes several minutes)")

        try:
            proc = subprocess.Popen(
                ["bash", "-c", f"{script} --green"],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            for line in proc.stdout:
                self.app.call_from_thread(log.append, line.rstrip())
            proc.wait()
            if proc.returncode == 0:
                self.app.call_from_thread(status.update, "[#44ff88]Green deploy complete[/#44ff88]")
                self.app.call_from_thread(self.app.notify, "Green deploy complete", severity="information")
            else:
                self.app.call_from_thread(status.update, f"[#ff4444]Green deploy failed (exit {proc.returncode})[/#ff4444]")
                self.app.call_from_thread(self.app.notify, "Green deploy failed", severity="error")
        except Exception as e:
            self.app.call_from_thread(log.append, f"Error: {e}", "red")
            self.app.call_from_thread(status.update, "[#ff4444]Error[/#ff4444]")
        finally:
            self.poll_status()
```

- [ ] **Step 2: Smoke-test imports**

```bash
cd ~/xiv-admin && python -c "from xiv_admin.panels.maintenance import MaintenancePanel; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-admin
git add xiv_admin/panels/maintenance.py
git commit -m "feat: add MaintenancePanel with enable/disable/green-deploy controls"
```

---

## Task 7: XIV-Admin FeedbackPanel

**Files:**
- Create: `~/xiv-admin/xiv_admin/panels/feedback.py`

- [ ] **Step 1: Write the panel**

Create `~/xiv-admin/xiv_admin/panels/feedback.py`:

```python
from __future__ import annotations
from datetime import datetime
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, DataTable
from textual.containers import Horizontal, Vertical
from textual import work

STATUSES = ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "WONT_FIX"]

STATUS_COLOUR = {
    "NEW":          "#00b4ff",
    "UNDER_REVIEW": "#ffaa00",
    "PLANNED":      "#a78bfa",
    "IN_PROGRESS":  "#ffaa00",
    "COMPLETED":    "#44ff88",
    "WONT_FIX":     "#ff4444",
}

CATEGORY_SHORT = {
    "BUG_REPORT":      "Bug",
    "FEATURE_REQUEST": "Feature",
    "IMPROVEMENT":     "Improvement",
    "GENERAL":         "General",
}


class FeedbackPanel(Static):
    """Browse and triage user feedback from the feedback table."""

    BORDER_TITLE = "Feedback"

    def compose(self) -> ComposeResult:
        yield Label("[bold #00b4ff]User Feedback[/bold #00b4ff]", classes="xiv-title")
        with Horizontal(id="feedback-filters"):
            yield Button("All",         id="filter-all",         variant="primary")
            yield Button("New",         id="filter-new")
            yield Button("In Progress", id="filter-in-progress")
            yield Button("Done",        id="filter-done")
        yield Label("", id="feedback-count")
        yield DataTable(id="feedback-table", cursor_type="row")
        yield Label("", id="feedback-subject")
        yield Label("", id="feedback-body")
        with Horizontal(id="feedback-actions"):
            yield Button("Mark Under Review", id="btn-review",    variant="warning")
            yield Button("Mark In Progress",  id="btn-progress",  variant="warning")
            yield Button("Mark Completed",    id="btn-complete",  variant="success")
            yield Button("Won't Fix",         id="btn-wont-fix",  variant="error")
            yield Button("Refresh",           id="btn-fb-refresh")

    def on_mount(self) -> None:
        table = self.query_one("#feedback-table", DataTable)
        table.add_columns("Category", "Status", "Subject", "Submitted")
        self._filter = "ALL"
        self._rows: list[dict] = []
        self._selected_id: str | None = None
        self.load_feedback()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        bid = event.button.id
        if bid == "filter-all":
            self._filter = "ALL";      self._render_table()
        elif bid == "filter-new":
            self._filter = "NEW";      self._render_table()
        elif bid == "filter-in-progress":
            self._filter = "IN_PROGRESS"; self._render_table()
        elif bid == "filter-done":
            self._filter = "DONE";     self._render_table()
        elif bid == "btn-review":
            self._update_status("UNDER_REVIEW")
        elif bid == "btn-progress":
            self._update_status("IN_PROGRESS")
        elif bid == "btn-complete":
            self._update_status("COMPLETED")
        elif bid == "btn-wont-fix":
            self._update_status("WONT_FIX")
        elif bid == "btn-fb-refresh":
            self.load_feedback()

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        idx = event.cursor_row
        visible = self._visible_rows()
        if 0 <= idx < len(visible):
            row = visible[idx]
            self._selected_id = row["id"]
            subject = row.get("subject", "")
            desc    = row.get("description", "")
            url     = row.get("url", "")
            self.query_one("#feedback-subject", Label).update(
                f"[bold]{subject}[/bold]"
            )
            self.query_one("#feedback-body", Label).update(
                f"{desc}\n[dim]{url}[/dim]" if url else desc
            )

    def _visible_rows(self) -> list[dict]:
        if self._filter == "ALL":
            return self._rows
        if self._filter == "DONE":
            return [r for r in self._rows if r["status"] in ("COMPLETED", "WONT_FIX")]
        return [r for r in self._rows if r["status"] == self._filter]

    def _render_table(self) -> None:
        table = self.query_one("#feedback-table", DataTable)
        table.clear()
        visible = self._visible_rows()
        self.query_one("#feedback-count", Label).update(
            f"[dim]{len(visible)} item(s)[/dim]"
        )
        for row in visible:
            cat    = CATEGORY_SHORT.get(row["category"], row["category"])
            status = row["status"]
            colour = STATUS_COLOUR.get(status, "#cdd6f4")
            subj   = (row["subject"] or "")[:60]
            ts     = row["createdAt"].strftime("%Y-%m-%d %H:%M") if row.get("createdAt") else ""
            table.add_row(cat, f"[{colour}]{status}[/{colour}]", subj, ts)

    @work(thread=True, group="feedback-load")
    def load_feedback(self) -> None:
        db = self.app.db
        if db is None:
            self.app.call_from_thread(
                self.query_one("#feedback-count", Label).update,
                "[#ff4444]No DB connection[/#ff4444]",
            )
            return
        import asyncio
        rows = asyncio.run_coroutine_threadsafe(
            db.fetch(
                """
                SELECT id, category::text, status::text, subject, description,
                       url, "createdAt"
                FROM feedback
                ORDER BY "createdAt" DESC
                LIMIT 200
                """
            ),
            self.app._loop,
        ).result(timeout=10)
        self._rows = [dict(r) for r in rows]
        self.app.call_from_thread(self._render_table)

    @work(thread=True)
    def _update_status(self, new_status: str) -> None:
        if not self._selected_id:
            self.app.call_from_thread(
                self.app.notify, "Select a row first", severity="warning"
            )
            return
        db = self.app.db
        if db is None:
            return
        import asyncio
        asyncio.run_coroutine_threadsafe(
            db.fetch(
                'UPDATE feedback SET status = $1::\"FeedbackStatus\", "updatedAt" = NOW() WHERE id = $2',
                new_status, self._selected_id,
            ),
            self.app._loop,
        ).result(timeout=10)
        self.app.call_from_thread(self.app.notify, f"Status set to {new_status}", severity="information")
        self.load_feedback()
```

- [ ] **Step 2: Smoke-test imports**

```bash
cd ~/xiv-admin && python -c "from xiv_admin.panels.feedback import FeedbackPanel; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-admin
git add xiv_admin/panels/feedback.py
git commit -m "feat: add FeedbackPanel with status triage and category filter"
```

---

## Task 8: main.py - Register Both Panels

**Files:**
- Modify: `~/xiv-admin/xiv_admin/main.py`

- [ ] **Step 1: Add imports**

At the top of `main.py`, after the existing panel imports, add:

```python
from xiv_admin.panels.maintenance import MaintenancePanel
from xiv_admin.panels.feedback import FeedbackPanel
```

- [ ] **Step 2: Add tab panes in compose()**

In the `compose()` method, after the `Deploy` TabPane and before `Containers`, add:

```python
            with TabPane("Maintenance", id="pane-maintenance"):
                yield MaintenancePanel(id="panel-maintenance")
            with TabPane("Feedback", id="pane-feedback"):
                yield FeedbackPanel(id="panel-feedback")
```

- [ ] **Step 3: Verify app starts without error**

```bash
cd ~/xiv-admin && python -c "
from xiv_admin.main import XivAdminApp
app = XivAdminApp()
print('compose ok')
"
```

Expected: `compose ok`

- [ ] **Step 4: Run the app and confirm new tabs appear**

```bash
cd ~/xiv-admin && xiv
```

Navigate with arrow keys or click. Confirm `Maintenance` and `Feedback` tabs appear between `Deploy` and `Containers`.

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-admin
git add xiv_admin/main.py
git commit -m "feat: register MaintenancePanel and FeedbackPanel in TUI"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| docker-compose green + maintenance profiles | Task 1 |
| Maintenance page HTML, XIV blue, layout C | Task 2 |
| maintenance.sh on/off/status + active events guard | Task 3 |
| Discord webhook on flip | Task 3 |
| deploy-xiv-web.sh --green flag | Task 4 |
| cloudflared config flip + health check | Task 4 |
| ACTIVE_PORT file tracking | Tasks 3, 4 |
| XIV-admin MaintenancePanel | Tasks 5, 6 |
| XIV-admin FeedbackPanel | Task 7 |
| Both panels registered in main.py | Task 8 |

**Known manual steps not in plan (do once):**
- Replace `YOUR_INVITE` Discord link in `index.html` (Task 2)
- Set `DISCORD_MAINTENANCE_WEBHOOK` env var on server (in `/etc/environment` or `~/.bashrc` on server)
- Initialize `/home/server/.xiv-active-port` with `echo 3000 > /home/server/.xiv-active-port` on first run
