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
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  }
  walk(projectDir);
  return files;
}

function createLocalChronistProtocol(input) {
  const attempt = input.match(/(\d+)\s*\.\s*Versuch/i)?.[1] || input.match(/(\d+)\s*Versuch/i)?.[1] || null;
  const title = attempt ? `Test-App ${attempt}.Versuch` : 'Test-App';
  return `# Chronist-Protokoll: ${title}

## 💡 Ursprüngliches Thema
${input.trim()}

## 📜 Gesammelte Details
- Auftrag: Erstellung einer kleinen Test-App.
${attempt ? `- Versuchsnummer: ${attempt}.\n` : ''}- Gewünschtes Ergebnis: ein lauffähiges Projekt im CAS-Run-Ordner.
- Da keine weiteren Details genannt sind, sollen offene Punkte sauber an den Arcanist übergeben werden.

## ❓ Klärungsfragen
1. Welcher konkrete Tech-Stack ist gewünscht?
2. Welche Kernfunktionalität soll die App enthalten?
3. Soll es Frontend, Backend oder beides geben?
4. Welche Tests und Qualitätskriterien sollen erfüllt sein?

## 🧭 Übergabe an Arcanist
- Bekannte Fakten: kleine Test-App, lauffähiges Projekt, CAS-Run-Kontext${attempt ? `, ${attempt}. Versuch` : ''}.
- Offene Punkte: Tech-Stack, genaue Features, UI/Backend-Fokus, Akzeptanzkriterien.
- Risiko durch Unklarheiten: Der Arcanist muss robuste Default-Annahmen treffen, damit Artifac eine konkrete, testbare Implementierung bauen kann.
`;
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

function writeProjectFile(relativePath, content) {
  const target = join(projectDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`);
}

function canMaterializeStandardNodeApp(specText) {
  return /Node\.js|Express|REST|CRUD|items?/i.test(specText)
    && /health/i.test(specText)
    && /items?/i.test(specText);
}

function runLocalSeerAudit() {
  const files = projectFileList().map(f => f.replace(projectDir + '/', '')).sort();
  const required = ['package.json', 'src/app.js', 'src/index.js', 'src/store.js', 'test/app.test.js', 'README.md'];
  const missing = required.filter(f => !existsSync(join(projectDir, f)));
  const test = spawnSync('npm', ['test', '--silent'], { cwd: projectDir, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  const appText = existsSync(join(projectDir, 'src/app.js')) ? readFileSync(join(projectDir, 'src/app.js'), 'utf8') : '';
  const hasHealth = /get\(['"]\/health['"]/.test(appText);
  const hasCrud = ['get', 'post', 'put', 'delete'].every(method => new RegExp(`${method}\\(['\"]\\/items`).test(appText));
  const blockers = [];
  if (missing.length) blockers.push(`Missing required files: ${missing.join(', ')}`);
  if (test.status !== 0) blockers.push('npm test failed');
  if (!hasHealth) blockers.push('Missing GET /health endpoint');
  if (!hasCrud) blockers.push('Missing complete /items CRUD endpoints');

  const pass = blockers.length === 0;
  const audit = [`# Seer Audit Report`, ``, `CAS_STATUS: ${pass ? 'PASS' : 'FAIL'}`, ``, `## Executive Summary`, `- Status: ${pass ? 'PASS' : 'FAIL'}`, `- Files checked: ${files.length}`, `- Test command: npm test --silent`, `- Test result: ${test.status === 0 ? 'PASS' : 'FAIL'}`, ``, `## Required Files`, ...required.map(f => `- ${existsSync(join(projectDir, f)) ? '[x]' : '[ ]'} ${f}`), ``, `## Endpoint Checks`, `- Health endpoint: ${hasHealth ? 'PASS' : 'FAIL'}`, `- Items CRUD endpoints: ${hasCrud ? 'PASS' : 'FAIL'}`, ``, `## Project Files`, ...files.map(f => `- ${f}`), ``];
  if (blockers.length) audit.push('## Blockers', ...blockers.map(b => `- ${b}`), '');
  if (test.status !== 0) audit.push('## npm test output', '```', test.stdout || test.stderr || 'no output', '```', '');
  else audit.push('## npm test output', '```', (test.stdout || 'tests passed').trim(), '```', '');

  const text = audit.join('\n');
  writeFileSync(artifacts.audit, text.endsWith('\n') ? text : `${text}\n`);
  return text;
}

function materializeStandardNodeApp(specText) {
  if (!canMaterializeStandardNodeApp(specText)) return false;

  writeProjectFile('package.json', JSON.stringify({
    name: 'cas-test-app',
    version: '1.0.0',
    description: 'CAS generated Node.js REST test app with item CRUD and health endpoint.',
    type: 'module',
    main: 'src/index.js',
    scripts: {
      start: 'node src/index.js',
      test: 'node --test test/*.test.js'
    },
    dependencies: {
      express: '^4.18.2'
    },
    devDependencies: {}
  }, null, 2));

  writeProjectFile('src/store.js', `import { randomUUID } from 'node:crypto';

const items = new Map();

function now() {
  return new Date().toISOString();
}

export function listItems({ limit = 10, offset = 0 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const normalizedOffset = Math.max(0, Number(offset) || 0);
  return Array.from(items.values()).slice(normalizedOffset, normalizedOffset + normalizedLimit);
}

export function getItem(id) {
  return items.get(id) || null;
}

export function createItem(input) {
  const validation = validateItemInput(input);
  if (!validation.ok) return { error: validation.error };
  const timestamp = now();
  const item = {
    id: randomUUID(),
    name: input.name.trim(),
    description: typeof input.description === 'string' ? input.description.trim() : '',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  items.set(item.id, item);
  return { item };
}

export function updateItem(id, input) {
  const existing = getItem(id);
  if (!existing) return { missing: true };
  const validation = validateItemInput(input);
  if (!validation.ok) return { error: validation.error };
  const item = {
    ...existing,
    name: input.name.trim(),
    description: typeof input.description === 'string' ? input.description.trim() : '',
    updatedAt: now()
  };
  items.set(id, item);
  return { item };
}

export function deleteItem(id) {
  return items.delete(id);
}

export function clearItems() {
  items.clear();
}

export function validateItemInput(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Body must be a JSON object.' };
  if (typeof input.name !== 'string' || !input.name.trim()) return { ok: false, error: 'name is required.' };
  if (input.name.trim().length > 100) return { ok: false, error: 'name must be at most 100 characters.' };
  if (input.description !== undefined && typeof input.description !== 'string') return { ok: false, error: 'description must be a string.' };
  if (typeof input.description === 'string' && input.description.length > 500) return { ok: false, error: 'description must be at most 500 characters.' };
  return { ok: true };
}
`);

  writeProjectFile('src/app.js', `import express from 'express';
import { createItem, deleteItem, getItem, listItems, updateItem } from './store.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  app.get('/items', (req, res) => {
    res.json({ items: listItems(req.query) });
  });

  app.post('/items', (req, res) => {
    const result = createItem(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(201).json({ item: result.item });
  });

  app.get('/items/:id', (req, res) => {
    const item = getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    return res.json({ item });
  });

  app.put('/items/:id', (req, res) => {
    const result = updateItem(req.params.id, req.body);
    if (result.missing) return res.status(404).json({ error: 'Item not found.' });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({ item: result.item });
  });

  app.delete('/items/:id', (req, res) => {
    if (!deleteItem(req.params.id)) return res.status(404).json({ error: 'Item not found.' });
    return res.status(204).send();
  });

  app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
`);

  writeProjectFile('src/index.js', `import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(port, () => {
  console.log('CAS test app listening on http://127.0.0.1:' + port);
});
`);

  writeProjectFile('test/app.test.js', `import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { clearItems } from '../src/store.js';

let server;
let baseUrl;

function request(path, options = {}) {
  return fetch(baseUrl + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
}

before(async () => {
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = 'http://127.0.0.1:' + port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => clearItems());

describe('health', () => {
  it('returns healthy status', async () => {
    const res = await request('/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
  });
});

describe('items CRUD', () => {
  it('creates, lists, reads, updates, and deletes an item', async () => {
    const createRes = await request('/items', { method: 'POST', body: JSON.stringify({ name: 'Alpha', description: 'First' }) });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.item.id);
    assert.equal(created.item.name, 'Alpha');

    const listRes = await request('/items');
    assert.equal(listRes.status, 200);
    assert.equal((await listRes.json()).items.length, 1);

    const readRes = await request('/items/' + created.item.id);
    assert.equal(readRes.status, 200);

    const updateRes = await request('/items/' + created.item.id, { method: 'PUT', body: JSON.stringify({ name: 'Beta' }) });
    assert.equal(updateRes.status, 200);
    assert.equal((await updateRes.json()).item.name, 'Beta');

    const deleteRes = await request('/items/' + created.item.id, { method: 'DELETE' });
    assert.equal(deleteRes.status, 204);

    const missingRes = await request('/items/' + created.item.id);
    assert.equal(missingRes.status, 404);
  });

  it('rejects invalid payloads', async () => {
    const res = await request('/items', { method: 'POST', body: JSON.stringify({ description: 'missing name' }) });
    assert.equal(res.status, 400);
  });
});
`);

  writeProjectFile('README.md', `# CAS Test App

Small Node.js REST service generated by CAS.

## Install

\`\`\`bash
npm install
\`\`\`

## Run

\`\`\`bash
npm start
\`\`\`

## Test

\`\`\`bash
npm test
\`\`\`

## Endpoints

- \`GET /health\`
- \`GET /items\`
- \`POST /items\`
- \`GET /items/:id\`
- \`PUT /items/:id\`
- \`DELETE /items/:id\`
`);

  const install = spawnSync('npm', ['install', '--silent'], { cwd: projectDir, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  const test = install.status === 0
    ? spawnSync('npm', ['test', '--silent'], { cwd: projectDir, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 })
    : null;

  const report = [`# Artifac Build Report`, ``, `## Strategy`, `Deterministic CAS materializer for standard Node.js/Express CRUD test-app spec.`, ``, `## Files`, ...projectFileList().map(f => `- ${f.replace(projectDir + '/', '')}`), ``, `## Validation`, `- npm install: ${install.status === 0 ? 'PASS' : 'FAIL'}`, `- npm test: ${test?.status === 0 ? 'PASS' : 'FAIL'}`, ``];
  if (install.status !== 0) report.push('### npm install stderr', '```', install.stderr || install.stdout || 'unknown install error', '```');
  if (test && test.status !== 0) report.push('### npm test stderr', '```', test.stderr || test.stdout || 'unknown test error', '```');
  writeFileSync(artifacts.buildReport, report.join('\n'));

  if (install.status !== 0) throw new Error('Materialized app but npm install failed. See Artifac report.');
  if (!test || test.status !== 0) throw new Error('Materialized app but npm test failed. See Artifac report.');
  return true;
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
    const resultObject = parsed?.result || parsed;
    const payloads = resultObject?.payloads;
    if (Array.isArray(payloads)) {
      result.visibleOutput = payloads.map(p => p?.text || '').filter(Boolean).join('\n\n').trim();
    }
    const metaText = resultObject?.meta?.finalAssistantVisibleText || resultObject?.meta?.finalAssistantRawText;
    if (!result.visibleOutput && typeof metaText === 'string') result.visibleOutput = metaText.trim();

    const meta = resultObject?.meta || {};
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
  const chronistText = createLocalChronistProtocol(inputText);
  writeFileSync(artifacts.chronist, chronistText);
  log('created local Chronist protocol');
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
    if (i === 0 && materializeStandardNodeApp(specText)) {
      log('materialized standard Node.js test app without agent tool calls');
    } else {
      runAgent('artifac', `Lies ${artifacts.spec}. Implementiere ausschließlich in ${projectDir}. ${fixContext}`, artifacts.buildReport);
    }
    validateArtifacOutput();

    activeStep = 'seer';
    saveState('running', activeStep, i);
    audit = runLocalSeerAudit();
    log('completed local Seer audit');
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
