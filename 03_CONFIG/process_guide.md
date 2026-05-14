# Prozessleitfaden für die Clawdia Agent Suite

## Start

```bash
node scripts/cas-runner.mjs --input "<Auftrag>" --title "<projektname>"
```

Optional kann `--input` auf eine Datei zeigen.

## Projektordner-Regel

Der Runner erzeugt pro Auftrag:

- `RUN_DIR`: Übergaben, Reports, Status
- `PROJECT_DIR`: eigentlicher Code

Agenten dürfen keine Projektdaten in ihren eigenen Workspaces ablegen. Wenn ein Agent ein Tool nutzt, muss er absolute Pfade aus dem Orchestrator-Prompt verwenden.

## Phasen

1. **Chronist**
   - Input: `00_input.md`
   - Output: `01_chronist.md`

2. **Arcanist**
   - Input: `01_chronist.md`
   - Output: `02_arcanist_spec.md`

3. **Artifac**
   - Input: `02_arcanist_spec.md`
   - Output: Code in `project/`, Bericht in `03_artifac_report.md`

4. **Seer**
   - Input: `02_arcanist_spec.md` + `project/`
   - Output: `04_seer_audit.md`
   - Muss `CAS_STATUS: PASS` oder `CAS_STATUS: FAIL` enthalten.

## Fehlerbehandlung

Bei `CAS_STATUS: FAIL` ruft der Runner Artifac erneut auf und gibt das Audit als Fix-Kontext mit. Nach `--max-iterations` wird der Run als fehlgeschlagen markiert.

## OpenClaw-Hinweis

Wenn der Workflow später direkt aus einem TaskFlow/Plugin gestartet wird, müssen Subagents mit `cwd: RUN_DIR` gespawnt werden. Sonst fällt OpenClaw auf den jeweiligen Agent-Workspace zurück.
