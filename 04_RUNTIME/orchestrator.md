# CAS Orchestrator Design

Der Orchestrator ist bewusst der einzige Koordinator. Die Rollen-Agenten arbeiten jeweils nur an ihrem Schritt und schreiben in den gemeinsamen Run-Ordner.

## Ablauf

1. Run-Ordner erzeugen
2. `00_input.md` schreiben
3. Chronist mit `RUN_DIR`/`PROJECT_DIR` starten
4. Arcanist mit Chronist-Output starten
5. Artifac mit Spezifikation starten
6. Seer mit Spezifikation + Projektcode starten
7. Wenn `CAS_STATUS: FAIL`, Artifac mit Audit erneut starten
8. Maximal `maxIterations` Loops, dann blockiert/fehlgeschlagen melden

## OpenClaw-Subagent-Regel

Wenn dieser Workflow aus einer OpenClaw-Session heraus orchestriert wird, muss jeder `sessions_spawn` explizit mit dem Projekt-Run-Ordner gestartet werden:

```ts
sessions_spawn({
  agentId: "artifac",
  cwd: RUN_DIR,
  task: "... absolute RUN_DIR/PROJECT_DIR verwenden ...",
  mode: "run",
  context: "isolated"
})
```

Wichtig: `cwd` ist nicht optional. Ohne `cwd` erbt ein Agent seinen eigenen Workspace, und genau dadurch landen Artefakte am falschen Ort.
