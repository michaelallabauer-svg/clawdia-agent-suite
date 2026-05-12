# ⚙️ Workflow Orchestrierung: Die Kette der Schöpfung
## Ziel
Dieses Dokument definiert die exakte, sequentielle Abfolge der Agenten, die notwendig ist, um eine vollständige Software-Lösung zu entwickeln.

## 🔗 Der Prozessablauf (TaskFlow)
1.  **[Trigger]** Ein externer Input (Ticket/Anfrage) wird empfangen.
2.  **Agent 1: Chronist** $\rightarrow$ Nimmt den Input auf.
3.  **Agent 2: Arcanist** $\rightarrow$ Nimmt den Output des Chronisten.
4.  **Agent 3: Artifac** $\rightarrow$ Nimmt die Spezifikation des Arkanisten.
5.  **Agent 4: Seer** $\rightarrow$ Nimmt den Code des Artifakteurs und validiert diesen.
6.  **[Ende]** Das finale Ergebnis (Pass-Report) wird an den Nutzer zurückgemeldet.

## ⚠️ Kritische Abhängigkeiten & Regeln
*   **Output-Handling:** Der Output jedes Agenten MUSS den perfekten Input für den nächsten Agenten sein.
*   **Fehlgeschlagener Schritt:** Wenn der Seer einen Fehler meldet, muss der Workflow *zurückspringen* und den Artifakteur anweisen, diesen Fehler zu beheben (Dies erfordert eine "Loop"-Funktionalität, die im Orchestrator implementiert werden muss).

---
*Hier wird das Skript für das TaskFlow/CronJob hinterlegt.*