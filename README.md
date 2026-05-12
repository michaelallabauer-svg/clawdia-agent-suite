# Clawdia Agent Suite (CAS) 🐾

<div align="center">

**AI-Driven Multi-Agent Software Development Pipeline**

_Orchestriert vage Anforderungen in getesteten, dokumentierten Artefakten_

</div>

---

## 🎯 Projektziel

Diese Suite definiert und orchestriert einen hochgradig automatisierten, multi-Agenten-Workflow zur Entwicklung von Softwarelösungen (Code Generation Pipeline). Sie dient dazu, vage Anforderungen von einer initialen Idee bis zu einem getesteten, dokumentierten Artefakt zu führen.

## 📖 Kernprinzipien

1. **Sequenzielle Magie:** Der Prozess ist stark sequenziell und erfordert eine klare Übergabe von *Output* eines Agenten an den *Input* des nächsten.
2. **Verantwortlichkeit:** Jeder Agent hat eine einzige, klar definierte Rolle (Arcanist, Chronist etc.) und darf nur seine spezifischen Werkzeuge nutzen.
3. **Persistenz:** Die gesamte Workflow-Definition ist in der `01_WORKFLOW_DEFINITION.md` festgeschrieben, um die Wiederherstellbarkeit zu gewährleisten.

## 🗂️ Repository Struktur

```
clawdia-agent-suite/
├── 01_WORKFLOW_DEFINITION.md    # Agenten-Kette & Prozessablauf
├── 02_SPECS/                    # System-Prompts (Agenten-"Seelen")
│   ├── chronist_prompt.md       # 📝 Daten-Sammler
│   ├── arcanist_prompt.md       # 🧠 Architekt & Spezifier
│   ├── artifac_prompt.md        # 🔨 Code-Baumeister
│   └── seer_prompt.md           # 👁️ Qualitätswächter
├── 03_CONFIG/                   # Labels & Prozess-Leitfaden
│   ├── agent_labels.json        # Agenten-Rollen & Beschreibungen
│   └── process_guide.md         # Orchestrierungs-Anleitung
└── README.md
```

## 🤖 Die Agenten-Kette

```
[Input/Ticket]
    ↓
📝 CHRONIST  → Rohdaten sammeln & dokumentieren
    ↓
🧠 ARCANIST  → Spezifikationen erstellen
    ↓
🔨 ARTIFAC   → Code generieren & testen
    ↓
👁️ SEER      → Audit-Report & Validierung
    ↓
[Ausgeliefertes Artefakt]
```

## 🚀 Schneller Start

### 1. Repository Klonen

```bash
gh repo clone michaelallabauer-svg/clawdia-agent-suite
cd clawdia-agent-suite
```

### 2. Workflow starten

Der Prozess startet immer mit einem Initial-Trigger (z.B. einem neuen Ticket) und wird durch einen zentralen Orchestrator gesteuert.

Siehe `01_WORKFLOW_DEFINITION.md` für den exakten Ablauf.

### 3. Agenten aktivieren

Jeder Agent benötigt einen LLM-Provider. Hier die empfohlenen Modelle:

| Agent | Empfohlenes Modell |
|-------|-------------------|
| Chronist | `gemma4` |
| Arcanist | `gemma4` |
| Artifac | `qwen2.5-coder:14b` oder `gemma4` |
| Seer | `gemma4` |

### 4. Manuelles Orchestrieren (Demo-Zwecke)

```bash
# Beispiel: Manueller Ablauf
echo "Ich möchte eine To-Do App mit Benutzer-Autentifizierung" \
  | ollama run gemma4 > chronist_output.md

# Dann Arcanist, Artifac, Seer ...
```

Für automatisierte Orchestrierung siehe `03_CONFIG/process_guide.md`.

## ⚙️ Workflow Definition

Der Workflow folgt einer strengen sequentiellen Kette:

1. **Trigger** → Input (Ticket/Anfrage)
2. **Chronist** → Sammelt & dokumentiert
3. **Arcanist** → Erstellt Spezifikationen
4. **Artifac** → Generiert Code
5. **Seer** → Validiert & Audit

**Kritische Regel:** Der Output eines Agenten MUSS den perfekten Input für den nächsten Agenten sein. Bei Fehlersuche springt der Workflow zurück zum Artifakteur.

## 📋 Agenten-Rollen im Detail

### 📝 Chronist (Data Collector)
- Sammelt Rohinformationen von der Quelle
- Dokumentiert unstrukturierte Anforderungen
- Stellt klare Fragen bei unvollständigen Daten

### 🧠 Arcanist (Architect)
- Verwandelt Rohdaten in präzise Spezifikationen
- Definiert Scope, Abhängigkeiten, Datenmodelle
- Dokumentiert Annahmen & Risiken

### 🔨 Artifakteur (Builder)
- Generiert funktionsfähigen Code
- Implementiert Tests für jeden Block
- Fragt bei externen Abhängigkeiten nach Freigabe

### 👁️ Seer (Auditor)
- Generiert Testfälle & Edge-Cases
- Erstellt Audit-Report (PASS/FAIL)
- Stellt Korrekturanweisungen

## ⚠️ Kritische Regeln (Red Lines)

- **Sicherheit:** Alle Tools müssen durch manuelle Bestätigung freigegeben werden (insbesondere Installationen).
- **Skalierbarkeit:** Der gesamte Workflow wird durch einen `taskflow/cron Job` gesteuert, der auf Telegram-Trigger lauscht.
- **Output-Handling:** Der Output jedes Agenten MUSS den perfekten Input für den nächsten Agenten sein.
- **Fehlgeschlagener Schritt:** Wenn der Seer einen Fehler meldet, muss der Workflow *zurückspringen* und den Artifakteur anweisen, diesen Fehler zu beheben.

## 🔧 Konfiguration

Alle Agenten-Konfigurationen befinden sich in `03_CONFIG/`:

- `agent_labels.json` → Agenten-Rollen und Beschreibungen
- `process_guide.md` → Orchestrierungs-Anleitung

Siehe `03_CONFIG/process_guide.md` für detaillierte Konfigurationsoptionen.

## 📚 Dokumentationen

- [Workflow Definition](./01_WORKFLOW_DEFINITION.md) → Exakter Prozessablauf
- [Agenten-Prompts](./02_SPECS/) → System-Prompts für jeden Agenten
- [Agenten-Labels](./03_CONFIG/agent_labels.json) → Rollen-Definitionen
- [Prozess-Leitfaden](./03_CONFIG/process_guide.md) → Orchestrierungs-Anleitung

## 🤝 Community

Haben Sie Fragen oder möchten Sie Verbesserungen vorschlagen? Öffnen Sie ein Issue!

## 📄 License

Diese Projekt steht unter der Apache License, Version 2.0. Siehe [LICENSE](LICENSE) für Details.

## 👤 Author

Erstellt von **Clawdia** – dem Agenten, der hilft, nicht nur posiert. 🐾

---

*_Dieses Repository dient als Grundlage für die fortlaufende Entwicklung der Clawdia-Agent-Suite._*