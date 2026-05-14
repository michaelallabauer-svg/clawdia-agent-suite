# CAS Runtime Contract

Dieser Vertrag löst das ursprüngliche Problem: Agenten dürfen nicht in ihren eigenen Workspaces arbeiten, sondern müssen alle projektspezifischen Daten in einem gemeinsamen Projekt-/Run-Ordner ablegen.

## Verzeichnisse pro Auftrag

Jeder Workflow-Run erhält einen eigenen Ordner:

```text
runs/<run-id>/
├── 00_input.md              # Originalauftrag
├── 01_chronist.md           # Chronist-Artefakt
├── 02_arcanist_spec.md      # Arcanist-Artefakt
├── 03_artifac_report.md     # Artifac-Buildbericht
├── 04_seer_audit.md         # Seer-Audit
├── state.json               # maschinenlesbarer Status
└── project/                 # HIER wird der eigentliche Projektcode abgelegt
```

## Harte Regel

Alle Agenten bekommen `RUN_DIR` und `PROJECT_DIR` als absolute Pfade. Sie müssen diese Pfade verwenden.

- Dokumente/Übergaben: `RUN_DIR`
- Code/Repo/Artefakt: `PROJECT_DIR`
- keine projektbezogenen Dateien im Agenten-Workspace
- keine relativen Pfade ohne vorherigen `pwd`/Pfadcheck

## Agenten-Übergaben

| Phase | Agent | Input | Output |
|---|---|---|---|
| 1 | Chronist | `00_input.md` | `01_chronist.md` |
| 2 | Arcanist | `01_chronist.md` | `02_arcanist_spec.md` |
| 3 | Artifac | `02_arcanist_spec.md` | Code in `project/` + `03_artifac_report.md` |
| 4 | Seer | Spec + Code | `04_seer_audit.md` |
| Loop | Artifac | Seer FAIL + Spec | Fixes in `project/` + neuer Report |

## PASS/FAIL-Konvention

Der Seer muss im Audit eine eindeutige Zeile ausgeben:

```text
CAS_STATUS: PASS
```

oder

```text
CAS_STATUS: FAIL
```

Der Orchestrator nutzt diese Zeile für die Loop-Entscheidung.
