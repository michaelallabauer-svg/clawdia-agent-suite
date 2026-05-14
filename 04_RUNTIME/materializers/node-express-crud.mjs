import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function writeProjectFile(projectDir, relativePath, content) {
  const target = join(projectDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`);
}

function projectFileList(projectDir) {
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

export function canMaterializeStandardNodeApp(specText) {
  return /Node\.js|Express|REST|CRUD|items?/i.test(specText)
    && /health/i.test(specText)
    && /items?/i.test(specText);
}

export function materializeStandardNodeApp({ specText, projectDir, buildReportPath }) {
  if (!canMaterializeStandardNodeApp(specText)) return false;

  writeProjectFile(projectDir, 'package.json', JSON.stringify({
    name: 'cas-test-app',
    version: '1.0.0',
    description: 'CAS generated Node.js REST test app with item CRUD and health endpoint.',
    type: 'module',
    main: 'src/index.js',
    scripts: {
      start: 'node src/index.js',
      test: 'node --test test/*.test.js'
    },
    dependencies: { express: '^4.18.2' },
    devDependencies: {}
  }, null, 2));

  writeProjectFile(projectDir, 'src/store.js', `import { randomUUID } from 'node:crypto';

const items = new Map();
const now = () => new Date().toISOString();

export function listItems({ limit = 10, offset = 0 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const normalizedOffset = Math.max(0, Number(offset) || 0);
  return Array.from(items.values()).slice(normalizedOffset, normalizedOffset + normalizedLimit);
}

export const getItem = id => items.get(id) || null;

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

export const deleteItem = id => items.delete(id);
export const clearItems = () => items.clear();

export function validateItemInput(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Body must be a JSON object.' };
  if (typeof input.name !== 'string' || !input.name.trim()) return { ok: false, error: 'name is required.' };
  if (input.name.trim().length > 100) return { ok: false, error: 'name must be at most 100 characters.' };
  if (input.description !== undefined && typeof input.description !== 'string') return { ok: false, error: 'description must be a string.' };
  if (typeof input.description === 'string' && input.description.length > 500) return { ok: false, error: 'description must be at most 500 characters.' };
  return { ok: true };
}
`);

  writeProjectFile(projectDir, 'src/app.js', `import express from 'express';
import { createItem, deleteItem, getItem, listItems, updateItem } from './store.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (req, res) => res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() }));
  app.get('/items', (req, res) => res.json({ items: listItems(req.query) }));
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

  writeProjectFile(projectDir, 'src/index.js', `import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const app = createApp();
app.listen(port, () => console.log('CAS test app listening on http://127.0.0.1:' + port));
`);

  writeProjectFile(projectDir, 'test/app.test.js', `import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { clearItems } from '../src/store.js';

let server;
let baseUrl;
const request = (path, options = {}) => fetch(baseUrl + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });

before(async () => {
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => new Promise(resolve => server.close(resolve)));
beforeEach(() => clearItems());

describe('health', () => {
  it('returns healthy status', async () => {
    const res = await request('/health');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'healthy');
  });
});

describe('items CRUD', () => {
  it('creates, lists, reads, updates, and deletes an item', async () => {
    const createRes = await request('/items', { method: 'POST', body: JSON.stringify({ name: 'Alpha', description: 'First' }) });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.item.id);

    assert.equal((await (await request('/items')).json()).items.length, 1);
    assert.equal((await request('/items/' + created.item.id)).status, 200);

    const updateRes = await request('/items/' + created.item.id, { method: 'PUT', body: JSON.stringify({ name: 'Beta' }) });
    assert.equal(updateRes.status, 200);
    assert.equal((await updateRes.json()).item.name, 'Beta');

    assert.equal((await request('/items/' + created.item.id, { method: 'DELETE' })).status, 204);
    assert.equal((await request('/items/' + created.item.id)).status, 404);
  });

  it('rejects invalid payloads', async () => {
    const res = await request('/items', { method: 'POST', body: JSON.stringify({ description: 'missing name' }) });
    assert.equal(res.status, 400);
  });
});
`);

  writeProjectFile(projectDir, 'README.md', `# CAS Test App

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

  const report = ['# Artifac Build Report', '', '## Strategy', 'Deterministic CAS materializer for standard Node.js/Express CRUD test-app spec.', '', '## Files', ...projectFileList(projectDir).map(f => `- ${f.replace(projectDir + '/', '')}`), '', '## Validation', `- npm install: ${install.status === 0 ? 'PASS' : 'FAIL'}`, `- npm test: ${test?.status === 0 ? 'PASS' : 'FAIL'}`, ''];
  if (install.status !== 0) report.push('### npm install stderr', '```', install.stderr || install.stdout || 'unknown install error', '```');
  if (test && test.status !== 0) report.push('### npm test stderr', '```', test.stderr || test.stdout || 'unknown test error', '```');
  writeFileSync(buildReportPath, report.join('\n'));

  if (install.status !== 0) throw new Error('Materialized app but npm install failed. See Artifac report.');
  if (!test || test.status !== 0) throw new Error('Materialized app but npm test failed. See Artifac report.');
  return true;
}
