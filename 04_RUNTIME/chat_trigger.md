# Chat-/Telegram-Trigger

Der Trigger ist als OpenClaw-Skill installiert:

```text
/Users/michaelallabauer/.openclaw/skills/cas-start/SKILL.md
```

## Verwendung

```text
/cas_start <Auftrag>
```

Fallback, falls die Oberfläche den direkten Skillnamen nicht anbietet:

```text
/skill cas-start <Auftrag>
```

## Verhalten

Der Skill startet:

```bash
cd /Users/michaelallabauer/.openclaw/workspace/Clawdia-agent-suit \
  && node scripts/cas-start.mjs --input '<Auftrag>' --title '<slug>'
```

`cas-start.mjs` läuft schnell durch, erzeugt einen Run-Ordner und startet `cas-runner.mjs` im Hintergrund. Dadurch blockiert Telegram/WebChat nicht während Chronist → Arcanist → Artifac → Seer laufen.

## Fortschritt prüfen

```bash
cat runs/<run-id>/state.json
cat runs/<run-id>/runner.stdout.log
cat runs/<run-id>/runner.stderr.log
```
