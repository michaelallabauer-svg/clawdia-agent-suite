# CAS Mission Control Dashboard

Start:

```bash
cd /Users/michaelallabauer/.openclaw/workspace/Clawdia-agent-suit
node dashboard/server.mjs --port=17888
```

URL:

```text
http://127.0.0.1:17888
```


LAN-erreichbar starten, z.B. vom iPhone/anderen Rechner im Heimnetz:

```bash
CAS_DASHBOARD_HOST=0.0.0.0 CAS_DASHBOARD_PORT=17888 node dashboard/server.mjs
```

Dann im Browser öffnen:

```text
http://<mac-mini-ip>:17888
```

## API

- `GET /api/runs` — alle Runs
- `GET /api/runs/:runId` — Run-Details
- `GET /api/runs/:runId/artifact/:key` — Artefakt lesen
- `GET /api/runs/:runId/project` — Projektdateien listen
- `POST /api/start` — neuen CAS-Run starten
- `POST /api/runs/:runId/manual-step` — einzelnen Agent-Schritt starten

## Sicherheit

Dashboard bindet standardmäßig nur an `127.0.0.1`. Es ist für lokale Bedienung gedacht, nicht für öffentliche Exposition.
