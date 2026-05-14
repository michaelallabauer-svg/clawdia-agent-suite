#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const inputArg = args.find(a => a === '--input') ? args[args.indexOf('--input') + 1] : null;
const titleArg = args.find(a => a === '--title') ? args[args.indexOf('--title') + 1] : null;
const maxIterations = Number(args.find(a => a === '--max-iterations') ? args[args.indexOf('--max-iterations') + 1] : 2);
const runIdArg = args.find(a => a === '--run-id') ? args[args.indexOf('--run-id') + 1] : null;
const dryRun = args.includes('--dry-run');

if (!inputArg) {
  console.error('Usage: node scripts/cas-runner.mjs --input <text-or-file> [--title slug] [--max-iterations 2] [--run-id id] [--dry-run]');
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const slug = (titleArg || inputArg).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'cas-run';
const runId = runIdArg || `${stamp}-${slug}`;
const runDir = resolve(repo, 'runs', runId);
const projectDir = join(runDir, 'project');
mkdirSync(projectDir, { recursive: true });

const inputText = existsSync(resolve(inputArg)) ? readFileSync(resolve(inputArg), 'utf8') : inputArg;
writeFileSync(join(runDir, '00_input.md'), inputText.trim() + '\n');

const artifacts = {
  input: join(runDir, '00_input.md'),
  chronist: join(runDir, '01_chronist.md'),
  spec: join(runDir, '02_arcanist_spec.md'),
  buildReport: join(runDir, '03_artifac_report.md'),
  audit: join(runDir, '04_seer_audit.md')
};

let activeStep = 'created';
let activeIteration = 0;

function log(message) {
  console.log(`[CAS] ${new Date().toISOString()} ${message}`);
}

function saveState(status, currentStep, iterations = 0, lastError = null) {
  writeFileSync(join(runDir, 'state.json'), JSON.stringify({
    runId, status, currentStep, runDir, projectDir, iterations, lastError, artifacts
  }, null, 2) + '\n');
}

function promptPath(name) {
  return join(repo, '02_SPECS', `${name}_prompt.md`);
}

function sessionIdFor(agent) {
  return `cas-${runId}-${agent}-${Date.now()}`.replace(/[^A-Za-z0-9._:-]/g, '-');
}

function isFallbackArtifact(path) {
  if (!existsSync(path)) return true;
  const head = readFileSync(path, 'utf8').slice(0, 160);
  return /^# .* output fallback/m.test(head);
}

function projectFileList() {
  const files = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  }
  walk(projectDir);
  return files;
}

function validateChronistOutput(text) {
  if (isFallbackArtifact(artifacts.chronist)) {
    throw new Error('Chronist did not write a real protocol; only fallback output exists.');
  }
  if (!/^# .+/m.test(text) || !/Übergabe|Uebergabe|Bekannte Fakten|Offene Punkte/i.test(text)) {
    throw new Error('Chronist output is incomplete: expected heading and handoff/known-facts section.');
  }
}

function validateArcanistOutput(text) {
  if (isFallbackArtifact(artifacts.spec)) {
    throw new Error('Arcanist did not write a real spec; only fallback output exists.');
  }
  const body = text.trim();
  const hasGoal = /(^|\n)#{1,3} .*?(Ziel|Goal)|(^|\n).*?(🎯|Ziel)\b/i.test(body);
  const hasScope = /Scope|Included|Excluded|Funktional|Anforderung/i.test(body);
  const hasTechnical = /API|Endpoint|Datenmodell|Architektur|Technolog|Implementierung|Stack/i.test(body);
  const refused = /NO_REPLY|nicht möglich|zu unklar|unseriös|Rücküberweisung|zurück an den Chronisten|keine brauchbare Spezifikation/i.test(body);
  if (body.length < 800 || !hasGoal || !hasScope || !hasTechnical || refused) {
    throw new Error(`Arcanist output is incomplete or refused: expected structured executable spec, got ${body.length} chars.`);
  }
}

function validateArtifacOutput() {
  const files = projectFileList();
  const hasEntrypoint = files.some(f => /(?:^|\/)src\/(?:index|server|app)\.(?:js|mjs|ts)$/.test(f));
  const hasPackage = existsSync(join(projectDir, 'package.json'));
  if (isFallbackArtifact(artifacts.buildReport)) {
    throw new Error('Artifac did not write a real build report; only fallback output exists.');
  }
  if (!hasPackage || !hasEntrypoint) {
    throw new Error(`Artifac output incomplete: expected package.json and src entrypoint in PROJECT_DIR, found ${files.length} file(s).`);
  }
}

function validateSeerOutput(auditText) {
  if (isFallbackArtifact(artifacts.audit)) {
    throw new Error('Seer did not write a real audit; only fallback output exists.');
  }
  if (!/^CAS_STATUS:\s*(PASS|FAIL)\s*$/im.test(auditText)) {
    throw new Error('Seer output is incomplete: missing exact CAS_STATUS: PASS or CAS_STATUS: FAIL line.');
  }
}

function validateSeerPass(auditText) {
  validateSeerOutput(auditText);
  return /^CAS_STATUS:\s*PASS\s*$/im.test(auditText);
}

function parseAgentResult(stdout) {
  const trimmed = stdout.trim();
  const result = { parsed: null, visibleOutput: trimmed, failed: false, reason: null };
  if (!trimmed) {
    result.visibleOutput = '';
    return result;
  }
  try {
    const parsed = JSON.parse(trimmed);
    result.parsed = parsed;
    const payloads = parsed?.result?.payloads;
    if (Array.isArray(payloads)) {
      result.visibleOutput = payloads.map(p => p?.text || '').filter(Boolean).join('\n\n').trim();
    }
    const metaText = parsed?.result?.meta?.finalAssistantVisibleText || parsed?.result?.meta?.finalAssistantRawText;
    if (!result.visibleOutput && typeof metaText === 'string') result.visibleOutput = metaText.trim();

    const meta = parsed?.result?.meta || {};
    const status = parsed?.status;
    const stopReason = parsed?.stopReason || meta.stopReason || meta.finishReason;
    if (status && status !== 'ok') {
      result.failed = true;
      result.reason = `agent status=${status}${stopReason ? ` stopReason=${stopReason}` : ''}`;
    }
    if (meta.aborted || meta.timedOut || meta.idleTimedOut || meta.externalAbort || meta.timedOutDuringCompaction || meta.timedOutDuringToolExecution) {
      result.failed = true;
      result.reason = meta.promptError || `agent aborted/timed out${stopReason ? ` stopReason=${stopReason}` : ''}`;
    }
    if (stopReason && /timeout|abort|error|rpc/i.test(String(stopReason))) {
      result.failed = true;
      result.reason = result.reason || `agent stopReason=${stopReason}`;
    }
  } catch {
    // stdout may already be plain text.
  }
  return result;
}

function truncateForPrompt(text, max = 120_000) {
  return text.length > max ? `${text.slice(0, max)}\n\n[... truncated ${text.length - max} chars ...]` : text;
}

function runAgent(agent, message, outPath, options = {}) {
  log(`starting ${agent}; expected artifact: ${outPath}`);
  const textOnly = options.textOnly === true;
  const outputInstruction = textOnly
    ? `Gib ausschließlich den finalen Inhalt für ${outPath} als Markdown/Text zurück. Verwende keine Tools, keine Tool-Calls, kein Lesen/Schreiben von Dateien. Der CAS-Runner speichert deine Antwort. Antworte niemals mit NO_REPLY.`
    : `Schreibe dein finales Artefakt nach: ${outPath}`;
  const workspaceInstruction = textOnly
    ? `Arbeite nur mit dem unten eingebetteten Kontext. Keine Tool-Nutzung.`
    : `Arbeite ausschließlich in RUN_DIR/PROJECT_DIR. Keine Dateien in deinem Agenten-Workspace ablegen. Verwende absolute Pfade.`;
  const fullMessage = `${readFileSync(promptPath(agent), 'utf8')}\n\n---\n\n# Orchestrator-Anweisung\n\nRUN_DIR: ${runDir}\nPROJECT_DIR: ${projectDir}\n\n${message}\n\n${outputInstruction}\n${workspaceInstruction}`;
  const started = Date.now();
  const res = spawnSync('openclaw', ['agent', '--agent', agent, '--session-id', sessionIdFor(agent), '--message', fullMessage, '--timeout', '900', '--json'], {
    cwd: runDir,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || `${agent} exited with status ${res.status}`).trim();
    throw new Error(`${agent} failed after ${elapsed}s: ${detail}`);
  }
  const agentResult = parseAgentResult(res.stdout);
  if (agentResult.failed) {
    if (!existsSync(outPath) && agentResult.visibleOutput) {
      writeFileSync(outPath, agentResult.visibleOutput.endsWith('\n') ? agentResult.visibleOutput : `${agentResult.visibleOutput}\n`);
    }
    throw new Error(`${agent} failed after ${elapsed}s: ${agentResult.reason || 'agent returned failed status'}`);
  }
  if (!existsSync(outPath)) {
    const visibleOutput = agentResult.visibleOutput;
    if (visibleOutput) {
      writeFileSync(outPath, visibleOutput.endsWith('\n') ? visibleOutput : `${visibleOutput}\n`);
      log(`recovered ${agent} artifact from visible agent output`);
    } else {
      // Preserve raw CLI output for diagnosis, but treat empty/missing artifacts as failure.
      writeFileSync(outPath, `# ${agent} output fallback\n\n\`\`\`json\n${res.stdout.trim()}\n\`\`\`\n`);
      throw new Error(`${agent} completed after ${elapsed}s but did not write expected artifact: ${outPath}`);
    }
  }
  log(`finished ${agent} in ${elapsed}s`);
  return readFileSync(outPath, 'utf8');
}

try {
  log(`run directory: ${runDir}`);
  log(`project directory: ${projectDir}`);

  if (dryRun) {
    saveState('created', 'dry-run');
    log(`dry run created: ${runDir}`);
    console.log(`CAS dry run created: ${runDir}`);
    process.exit(0);
  }

  activeStep = 'chronist';
  saveState('running', activeStep);
  const chronistText = runAgent('chronist', `Erstelle das Rohprotokoll aus dieser Eingabe:\n\n--- INPUT ---\n${truncateForPrompt(inputText)}\n--- END INPUT ---`, artifacts.chronist, { textOnly: true });
  validateChronistOutput(chronistText);

  activeStep = 'arcanist';
  saveState('running', activeStep);
  const specText = runAgent('arcanist', `Erstelle eine ausführbare Spezifikation aus diesem Chronist-Protokoll:\n\n--- CHRONIST ---\n${truncateForPrompt(chronistText)}\n--- END CHRONIST ---`, artifacts.spec, { textOnly: true });
  validateArcanistOutput(specText);

  let audit = '';
  for (let i = 0; i <= maxIterations; i++) {
    activeIteration = i;
    activeStep = i === 0 ? 'artifac' : 'artifac-fix';
    saveState('running', activeStep, i);
    const fixContext = i === 0 ? '' : `Zusätzlich liegt ein Seer-FAIL in ${artifacts.audit}. Behebe die dort genannten Fehler.`;
    runAgent('artifac', `Lies ${artifacts.spec}. Implementiere ausschließlich in ${projectDir}. ${fixContext}`, artifacts.buildReport);
    validateArtifacOutput();

    activeStep = 'seer';
    saveState('running', activeStep, i);
    audit = runAgent('seer', `Lies ${artifacts.spec}, prüfe den Code in ${projectDir}, schreibe Audit mit eindeutiger Zeile CAS_STATUS: PASS oder CAS_STATUS: FAIL.`, artifacts.audit, { textOnly: false });
    if (validateSeerPass(audit)) {
      saveState('passed', 'done', i);
      console.log(`CAS run passed: ${runDir}`);
      process.exit(0);
    }
  }

  saveState('failed', 'seer-fail', maxIterations, 'Seer did not produce CAS_STATUS: PASS within max iterations');
  console.error(`CAS run failed after ${maxIterations} iterations: ${runDir}`);
  process.exit(1);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  saveState('failed', activeStep, activeIteration, message);
  console.error(`[CAS] failed at ${activeStep}: ${message}`);
  console.error(`[CAS] run directory: ${runDir}`);
  process.exit(1);
}
