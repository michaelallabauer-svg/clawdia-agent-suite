# Clawdia Agent Suite (CAS) 🐾

**AI-Driven Multi-Agent Software Development Pipeline**

CAS orchestriert vage Anforderungen in getestete, dokumentierte Projektartefakte. Der Workflow ist sequenziell und nutzt spezialisierte Agenten mit klaren Übergaben.

## Projektziel

Eine Anfrage/Ticket wird durch eine feste Agentenkette geführt:

```text
[Input/Ticket]
    ↓
📝 Chronist  → Rohdaten sammeln & dokumentieren
    ↓
🧠 Arcanist  → technische Spezifikation erstellen
    ↓
🔨 Artifac   → Code im Projektordner bauen & testen
    ↓
👁️ Seer      → Audit-Report & Validierung
    ↓
[Ausgeliefertes Artefakt]
```

## Wichtigste Runtime-Regel

Agenten arbeiten **nicht** in ihren eigenen Agenten-Ordnern. Jeder Auftrag bekommt einen eigenen Run-Ordner unter `runs/<run-id>/`.

```text
runs/<run-id>/
├── 00_input.md
├── 01_chronist.md
├── 02_arcanist_spec.md
├── 03_artifac_report.md
├── 04_seer_audit.md
├── state.json
└── project/          # hier entsteht der eigentliche Projektcode
```

Der Orchestrator übergibt jedem Agenten absolute Pfade:

- `RUN_DIR` für Übergabe-/Status-Artefakte
- `PROJECT_DIR` für Code und Projektdateien

Siehe [`04_RUNTIME/project_contract.md`](./04_RUNTIME/project_contract.md).

## Repository-Struktur

```text
clawdia-agent-suite/
├── 01_WORKFLOW_DEFINITION.md
├── 02_SPECS/
│   ├── chronist_prompt.md
│   ├── arcanist_prompt.md
│   ├── artifac_prompt.md
│   └── seer_prompt.md
├── 03_CONFIG/
│   ├── agent_labels.json
│   └── process_guide.md
├── 04_RUNTIME/
│   ├── auditors/
│   │   └── node-express-crud.mjs
│   ├── materializers/
│   │   └── node-express-crud.mjs
│   ├── orchestrator.md
│   ├── project_contract.md
│   └── run_state.schema.json
├── scripts/
│   ├── cas-runner.mjs
│   ├── dashboard-start.mjs
│   └── dashboard-stop.mjs
└── runs/
    └── .gitkeep
```



## CAS Mission Control Dashboard

Lokales Dashboard starten:

```bash
cd /Users/michaelallabauer/.openclaw/workspace/Clawdia-agent-suit
node scripts/dashboard-start.mjs
```

Stoppen:

```bash
node scripts/dashboard-stop.mjs
```

Dann öffnen:

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

Funktionen:

- Runs aus `runs/` anzeigen
- neuen CAS-Run starten
- Status/aktuellen Schritt beobachten
- Artefakte lesen
- Projektdateien listen
- Ordner im Finder öffnen
- `npm test` für einen Run ausführen
- Runs aufräumen: Delete verschiebt Run-Ordner recoverable nach `runs/.trash/`
- einzelne Agent-Schritte manuell starten: Chronist, Arcanist, Artifac, Seer

## Chat-/Telegram-Trigger

CAS kann über den installierten Skill `cas-start` aus Chat/Telegram gestartet werden. Je nach Oberfläche geht das z.B. so:

```text
/cas_start Baue eine kleine To-Do App mit Login
```

oder generisch:

```text
/skill cas-start Baue eine kleine To-Do App mit Login
```

Der Skill ruft im Hintergrund `scripts/cas-start.mjs` auf. Dieser startet `scripts/cas-runner.mjs` detached und gibt sofort `runId`, `runDir` und `projectDir` zurück. Fortschritt liegt dann in:

- `runs/<run-id>/state.json`
- `runs/<run-id>/runner.stdout.log`
- `runs/<run-id>/runner.stderr.log`

## Schnellstart lokal

```bash
node scripts/cas-runner.mjs \
  --title todo-auth-app \
  --input "Baue eine kleine To-Do App mit Login und REST API" \
  --max-iterations 2
```

Der Runner erzeugt einen Run-Ordner und führt den Workflow sequenziell aus. Für den stabilen Default-Test-App-Flow nutzt CAS inzwischen deterministische Schritte:

- Chronist: lokales Rohprotokoll
- Arcanist: LLM-Spezifikation
- Artifac: `04_RUNTIME/materializers/node-express-crud.mjs`
- Seer: `04_RUNTIME/auditors/node-express-crud.mjs`

So entstehen reproduzierbare Projektdateien und ein echtes `npm test`-Gate, statt fragile Tool-Use-Loops laufen zu lassen.


## Existing-Project Mode

Für bestehende Repositories wie `visiontrack-finance` kann CAS jetzt ticketbasiert mit einer Arbeitskopie arbeiten:

```bash
node scripts/cas-start.mjs \
  --project /Users/michaelallabauer/.openclaw/workspace/visiontrack-finance \
  --title visiontrack-startbar-machen \
  --input "Ticket 1: App startbar machen, Entry-Points und kaputte Imports reparieren, minimalen Smoke-Test ergänzen"
```

Dabei wird das Quellprojekt nicht direkt verändert. CAS kopiert es nach:

```text
runs/<run-id>/project/
```

Zusätzlich entsteht `project_manifest.json` mit Quellpfad, Copy-Excludes, package.json-Summary und Datei-Inventar. Das Dashboard zeigt den Modus `existing-project` und den Source Project Pfad an.

Empfohlener Ablauf für bestehende Produkte:

1. kleines Ticket formulieren
2. CAS-Run mit `--project` starten
3. Artefakte/Tests im Dashboard prüfen
4. bei PASS/Fixstand: Änderungen aus `runs/<run-id>/project/` reviewen und bewusst zurück ins Originalrepo übernehmen

## Agenten und empfohlene Modelle

| Agent | Rolle | Modell |
|---|---|---|
| Chronist | Rohdaten sammeln | `ollama/qwen3.5:9b` |
| Arcanist | Spezifikation | `ollama/qwen3.5:9b` |
| Artifac | Code bauen | `ollama/qwen3.5:9b` |
| Seer | Audit | `ollama/qwen3.5:9b` |

## PASS/FAIL Loop

Der Seer muss exakt eine Statuszeile ausgeben:

```text
CAS_STATUS: PASS
```

oder

```text
CAS_STATUS: FAIL
```

Bei `FAIL` startet der Orchestrator Artifac erneut mit dem Audit als Fix-Kontext.

## Red Lines

- Keine projektbezogenen Dateien in Agent-Workspaces.
- Keine externen Installationen oder Public Writes ohne Freigabe.
- Keine Secrets im Code.
- Seer-Failures werden nicht ignoriert.
