# 📜 Prozessleitfaden für die Agenten-Suite

Dieses Dokument dient als "How-To" für jeden, der die CAS verwenden möchte.

## 🛠️ Workflow-Ablauf
1.  **Start:** Prozess initiiert durch [Trigger].
2.  **Phase 1 (Chronist):** Nimmt Input entgegen. Output ist ein **Rohprotokoll**.
3.  **Phase 2 (Arkanist):** Nimmt Protokoll. Output ist die **formale Spezifikation**.
4.  **Phase 3 (Artifac):** Nimmt Spezifikation. Output ist der **Code**.
5.  **Phase 4 (Seer):** Nimmt Code. Output ist der **Audit-Report** (PASS/FAIL).

## 🔄 Fehlerbehandlung (Der Rücksprung)
*   **Wenn Seer FAIL meldet:** Der TaskFlow muss den Artifakteur in einen **Iterative Korrekturmodus** versetzen. Der Prompt für den Artifakteur muss mit dem Fehlermeldung des Seers versehen werden.

## 🧑‍💻 Zugriff
Nutze immer die `agent_labels.json` für die korrekte Zuordnung eines Agenten zur Rolle.

---
*Wichtig: Alle Prompt-Templates müssen in den `02_SPECS/` Ordner verlinkt werden.*