# Clawdia Agent Suite (CAS)

## 🐾 Projektziel
Diese Suite definiert und orchestriert einen hochgradig automatisierten, multi-Agenten-Workflow zur Entwicklung von Softwarelösungen (Code Generation Pipeline). Sie dient dazu, vage Anforderungen von einer initialen Idee bis zu einem getesteten, dokumentierten Artefakt zu führen.

## 📖 Kernprinzipien
1.  **Sequenzielle Magie:** Der Prozess ist stark sequenziell und erfordert eine klare Übergabe von *Output* eines Agenten an den *Input* des nächsten.
2.  **Verantwortlichkeit:** Jeder Agent hat eine einzige, klar definierte Rolle (Arkanist, Chronist etc.) und darf nur seine spezifischen Werkzeuge nutzen.
3.  **Persistenz:** Die gesamte Workflow-Definition ist in der `01_WORKFLOW_DEFINITION.md` festgeschrieben, um die Wiederherstellbarkeit zu gewährleisten.

## 🗂️ Repository Struktur
- `01_WORKFLOW_DEFINITION.md`: Definiert die Reihenfolge und Abhängigkeiten der Agents.
- `02_SPECS/`: Enthält die System-Prompts (die "Seelen") jedes Agenten.
- `03_CONFIG/`: Enthält die Labels und Prozesse.
- `README.md`: Globale Einführung.

## 🚀 Start des Workflows
Der Prozess startet immer mit einem Initial-Trigger (z.B. einem neuen Ticket) und wird durch einen zentralen Orchestrator gesteuert.

---
*Erstellt von Clawdia. Für die fortlaufende Entwicklung hier die Prinzipien hinterlegt.*