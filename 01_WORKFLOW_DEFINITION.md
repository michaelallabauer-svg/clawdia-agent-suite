# Workflow-Orchestrierung: Die Kette der Schöpfung

## Ziel

Dieses Dokument definiert die ausführbare, sequentielle Abfolge der Clawdia Agent Suite. Der Workflow nimmt einen externen Input entgegen und erzeugt ein getestetes Projektartefakt in einem gemeinsamen Projektordner.

## Runtime-Verzeichnisse

Jeder Auftrag erhält einen eigenen Run-Ordner:

```text
runs/<run-id>/
├── 00_input.md
├── 01_chronist.md
├── 02_arcanist_spec.md
├── 03_artifac_report.md
├── 04_seer_audit.md
├── state.json
└── project/
```

**Pflicht:** Alle Agenten müssen in diesen Ordnern arbeiten. `project/` ist der einzige Ort für Projektcode.

## Prozessablauf

1. **Trigger**: Input/Ticket wird als `00_input.md` gespeichert.
2. **Chronist**: liest `00_input.md`, schreibt `01_chronist.md`.
3. **Arcanist**: liest `01_chronist.md`, schreibt `02_arcanist_spec.md`.
4. **Artifac**: liest `02_arcanist_spec.md`, baut Code in `project/`, schreibt `03_artifac_report.md`.
5. **Seer**: liest Spec + Code, schreibt `04_seer_audit.md` mit `CAS_STATUS`.
6. **Loop**: Bei `CAS_STATUS: FAIL` geht der Workflow zurück zu Artifac.
7. **Ende**: Bei `CAS_STATUS: PASS` ist der Auftrag abgeschlossen.

## Kritische Regeln

- Output jedes Agenten muss perfekter Input für den nächsten sein.
- Keine Agenten-eigenen Workspaces für Projektdaten.
- Alle Pfade werden absolut übergeben: `RUN_DIR`, `PROJECT_DIR`.
- Der Seer entscheidet formal über PASS/FAIL.
- Der Orchestrator hält `state.json` aktuell.

## Startpunkt

Referenzimplementierung:

```bash
node scripts/cas-runner.mjs --input "<auftrag>" --title "<slug>"
```
