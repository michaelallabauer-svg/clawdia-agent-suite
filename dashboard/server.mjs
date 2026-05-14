#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  openSync,
  renameSync
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, dirname, relative } from 'node:path';
import { runProjectTests } from '../04_RUNTIME/auditors/node-express-crud.mjs';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(repo, 'dashboard', 'public');
const runsDir = join(repo, 'runs');
const port = Number(process.env.CAS_DASHBOARD_PORT || process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || 17888);
const host = process.env.CAS_DASHBOARD_HOST || '127.0.0.1';

const ARTIFACTS = {
  input: '00_input.md',
  chronist: '01_chronist.md',
  spec: '02_arcanist_spec.md',
  buildReport: '03_artifac_report.md',
  audit: '04_seer_audit.md',
  state: 'state.json',
  stdout: 'runner.stdout.log',
  stderr: 'runner.stderr.log',
  start: 'start.json'
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function json(req) {
  return new Promise((resolveBody, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data.trim()) return resolveBody({});
      try { resolveBody(JSON.parse(data)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function safeRunDir(runId) {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error('invalid run id');
  const dir = resolve(runsDir, runId);
  if (!dir.startsWith(resolve(runsDir) + '/')) throw new Error('invalid run path');
  return dir;
}

function readJson(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function readText(path, max = 400_000) {
  const text = readFileSync(path, 'utf8');
  return text.length > max ? text.slice(-max) : text;
}

function runSummary(runId) {
  const dir = safeRunDir(runId);
  const state = readJson(join(dir, 'state.json'), {});
  const start = readJson(join(dir, 'start.json'), {});
  const buildReportPath = join(dir, ARTIFACTS.buildReport);
  const mode = existsSync(buildReportPath) && readText(buildReportPath, 20_000).includes('Deterministic CAS materializer') ? 'deterministic' : 'agentic';
  const files = {};
  for (const [key, file] of Object.entries(ARTIFACTS)) {
    const path = join(dir, file);
    if (existsSync(path)) files[key] = { file, size: statSync(path).size, mtimeMs: statSync(path).mtimeMs };
  }
  let mtimeMs = 0;
  try {
    for (const entry of readdirSync(dir)) mtimeMs = Math.max(mtimeMs, statSync(join(dir, entry)).mtimeMs);
  } catch {}
  return {
    runId,
    runDir: dir,
    projectDir: join(dir, 'project'),
    status: state.status || start.status || 'unknown',
    currentStep: state.currentStep || 'unknown',
    mode,
    iterations: state.iterations ?? 0,
    lastError: state.lastError || null,
    startedAt: start.startedAt || null,
    mtimeMs,
    files
  };
}

function listRuns() {
  mkdirSync(runsDir, { recursive: true });
  return readdirSync(runsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => runSummary(d.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function slugify(text) {
  return String(text || 'cas-run').toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'cas-run';
}

function startCas({ input, title, maxIterations = 2 }) {
  if (!input || !String(input).trim()) throw new Error('input required');
  const child = spawn(process.execPath, [
    join(repo, 'scripts', 'cas-start.mjs'),
    '--input', String(input),
    '--title', slugify(title || input),
    '--max-iterations', String(maxIterations)
  ], { cwd: repo, encoding: 'utf8' });
  return new Promise((resolveStart, reject) => {
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(err || out || `cas-start exited ${code}`));
      try { resolveStart(JSON.parse(out)); } catch { reject(new Error(`invalid cas-start output: ${out || err}`)); }
    });
  });
}

function stepInfo(runId, agent) {
  const dir = safeRunDir(runId);
  const projectDir = join(dir, 'project');
  const artifact = {
    chronist: join(dir, '01_chronist.md'),
    arcanist: join(dir, '02_arcanist_spec.md'),
    artifac: join(dir, '03_artifac_report.md'),
    seer: join(dir, '04_seer_audit.md')
  }[agent];
  const message = {
    chronist: `Lies ${join(dir, '00_input.md')} und erstelle das Rohprotokoll.`,
    arcanist: `Lies ${join(dir, '01_chronist.md')} und erstelle eine ausführbare Spezifikation.`,
    artifac: `Lies ${join(dir, '02_arcanist_spec.md')}. Implementiere ausschließlich in ${projectDir}.`,
    seer: `Lies ${join(dir, '02_arcanist_spec.md')}, prüfe den Code in ${projectDir}, schreibe Audit mit eindeutiger Zeile CAS_STATUS: PASS oder CAS_STATUS: FAIL.`
  }[agent];
  if (!artifact || !message) throw new Error('unknown agent');
  return { dir, projectDir, artifact, message };
}

function deleteRun(runId) {
  const dir = safeRunDir(runId);
  const state = readJson(join(dir, 'state.json'), {});
  if (state.status === 'running') throw new Error('cannot delete a running run');
  const trashDir = join(runsDir, '.trash');
  mkdirSync(trashDir, { recursive: true });
  const target = join(trashDir, `${runId}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  renameSync(dir, target);
  return { ok: true, runId, trashedTo: target };
}

function testRun(runId) {
  const dir = safeRunDir(runId);
  const projectDir = join(dir, 'project');
  const result = runProjectTests(projectDir);
  const logPath = join(dir, `dashboard-test-${Date.now()}.log`);
  writeFileSync(logPath, [
    `# Dashboard Test Run`,
    `status: ${result.ok ? 'PASS' : 'FAIL'}`,
    `exit: ${result.status}`,
    '',
    '## stdout',
    '```',
    result.stdout.trim(),
    '```',
    '',
    '## stderr',
    '```',
    result.stderr.trim(),
    '```',
    ''
  ].join('\n'));
  return { ...result, logPath };
}

function startManualStep({ runId, agent, note = '' }) {
  if (!['chronist', 'arcanist', 'artifac', 'seer'].includes(agent)) throw new Error('unknown agent');
  const { dir, projectDir, artifact, message } = stepInfo(runId, agent);
  const promptPath = join(repo, '02_SPECS', `${agent}_prompt.md`);
  if (!existsSync(promptPath)) throw new Error(`missing prompt: ${promptPath}`);
  const fullMessage = `${readFileSync(promptPath, 'utf8')}\n\n---\n\n# Dashboard-Anweisung\n\nRUN_DIR: ${dir}\nPROJECT_DIR: ${projectDir}\n\n${message}\n${note ? `\nZusatznotiz: ${note}\n` : ''}\nSchreibe dein finales Artefakt nach: ${artifact}\nArbeite ausschließlich in RUN_DIR/PROJECT_DIR. Keine Dateien in deinem Agenten-Workspace ablegen. Verwende absolute Pfade.`;
  const logPath = join(dir, `manual-${agent}-${Date.now()}.log`);
  const fd = openSync(logPath, 'a');
  const child = spawn('openclaw', ['agent', '--agent', agent, '--session-id', `cas-${runId}-${agent}-${Date.now()}`, '--message', fullMessage, '--timeout', '900', '--json'], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', fd, fd]
  });
  child.unref();
  const statePath = join(dir, 'state.json');
  const state = readJson(statePath, { runId, runDir: dir, projectDir, iterations: 0, artifacts: {} });
  state.status = 'running';
  state.currentStep = `manual-${agent}`;
  state.lastError = null;
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  return { ok: true, pid: child.pid, runId, agent, logPath, artifact };
}

function serveStatic(req, res, pathname) {
  const file = pathname === '/' ? join(publicDir, 'index.html') : resolve(publicDir, `.${pathname}`);
  if (!file.startsWith(resolve(publicDir) + '/') && file !== join(publicDir, 'index.html')) return send(res, 403, 'forbidden');
  if (!existsSync(file) || statSync(file).isDirectory()) return send(res, 404, 'not found');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/runs' && req.method === 'GET') return send(res, 200, { runs: listRuns() });
    if (url.pathname === '/api/start' && req.method === 'POST') return send(res, 200, await startCas(await json(req)));
    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch && req.method === 'GET') return send(res, 200, runSummary(runMatch[1]));
    if (runMatch && req.method === 'DELETE') return send(res, 200, deleteRun(runMatch[1]));
    const testMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/test$/);
    if (testMatch && req.method === 'POST') return send(res, 200, testRun(testMatch[1]));
    const artifactMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/artifact\/([^/]+)$/);
    if (artifactMatch && req.method === 'GET') {
      const dir = safeRunDir(artifactMatch[1]);
      const file = ARTIFACTS[artifactMatch[2]];
      if (!file) return send(res, 404, 'unknown artifact');
      const path = join(dir, file);
      if (!existsSync(path)) return send(res, 404, 'artifact missing');
      return send(res, 200, { key: artifactMatch[2], file, text: readText(path) });
    }
    const projectMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/project$/);
    if (projectMatch && req.method === 'GET') {
      const projectDir = join(safeRunDir(projectMatch[1]), 'project');
      const files = [];
      function walk(dir) {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          const rel = relative(projectDir, path);
          if (entry.isDirectory()) walk(path);
          else files.push({ path: rel, size: statSync(path).size });
        }
      }
      walk(projectDir);
      return send(res, 200, { projectDir, files: files.sort((a, b) => a.path.localeCompare(b.path)) });
    }
    const openFinderMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/open-finder$/);
    if (openFinderMatch && req.method === 'POST') {
      const projectDir = join(safeRunDir(openFinderMatch[1]), 'project');
      mkdirSync(projectDir, { recursive: true });
      const result = spawnSync('open', [projectDir], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'open failed');
      return send(res, 200, { ok: true, projectDir });
    }
    const manualMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/manual-step$/);
    if (manualMatch && req.method === 'POST') {
      const body = await json(req);
      return send(res, 200, startManualStep({ runId: manualMatch[1], agent: body.agent, note: body.note }));
    }
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(port, host, () => {
  console.log(`CAS Mission Control running at http://${host}:${port}`);
  console.log(`Repo: ${repo}`);
});
