#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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

function runAgent(agent, message, outPath) {
  log(`starting ${agent}; expected artifact: ${outPath}`);
  const fullMessage = `${readFileSync(promptPath(agent), 'utf8')}\n\n---\n\n# Orchestrator-Anweisung\n\nRUN_DIR: ${runDir}\nPROJECT_DIR: ${projectDir}\n\n${message}\n\nSchreibe dein finales Artefakt nach: ${outPath}\nArbeite ausschließlich in RUN_DIR/PROJECT_DIR. Keine Dateien in deinem Agenten-Workspace ablegen. Verwende absolute Pfade.`;
  const started = Date.now();
  const res = spawnSync('openclaw', ['agent', '--agent', agent, '--message', fullMessage, '--timeout', '900', '--json'], {
    cwd: runDir,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || `${agent} exited with status ${res.status}`).trim();
    throw new Error(`${agent} failed after ${elapsed}s: ${detail}`);
  }
  if (!existsSync(outPath)) {
    // Fallback: preserve visible CLI output so the handoff is not lost.
    writeFileSync(outPath, `# ${agent} output fallback\n\n\`\`\`json\n${res.stdout.trim()}\n\`\`\`\n`);
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
  runAgent('chronist', `Lies ${artifacts.input} und erstelle das Rohprotokoll.`, artifacts.chronist);

  activeStep = 'arcanist';
  saveState('running', activeStep);
  runAgent('arcanist', `Lies ${artifacts.chronist} und erstelle eine ausführbare Spezifikation.`, artifacts.spec);

  let audit = '';
  for (let i = 0; i <= maxIterations; i++) {
    activeIteration = i;
    activeStep = i === 0 ? 'artifac' : 'artifac-fix';
    saveState('running', activeStep, i);
    const fixContext = i === 0 ? '' : `Zusätzlich liegt ein Seer-FAIL in ${artifacts.audit}. Behebe die dort genannten Fehler.`;
    runAgent('artifac', `Lies ${artifacts.spec}. Implementiere ausschließlich in ${projectDir}. ${fixContext}`, artifacts.buildReport);

    activeStep = 'seer';
    saveState('running', activeStep, i);
    audit = runAgent('seer', `Lies ${artifacts.spec}, prüfe den Code in ${projectDir}, schreibe Audit mit eindeutiger Zeile CAS_STATUS: PASS oder CAS_STATUS: FAIL.`, artifacts.audit);
    if (/CAS_STATUS:\s*PASS/i.test(audit)) {
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
