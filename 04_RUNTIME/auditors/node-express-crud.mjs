import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

export function runNodeExpressCrudAudit({ projectDir, auditPath }) {
  const files = projectFileList(projectDir).map(f => f.replace(projectDir + '/', '')).sort();
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
  const audit = [
    '# Seer Audit Report',
    '',
    `CAS_STATUS: ${pass ? 'PASS' : 'FAIL'}`,
    '',
    '## Executive Summary',
    `- Status: ${pass ? 'PASS' : 'FAIL'}`,
    `- Files checked: ${files.length}`,
    '- Test command: npm test --silent',
    `- Test result: ${test.status === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '## Required Files',
    ...required.map(f => `- ${existsSync(join(projectDir, f)) ? '[x]' : '[ ]'} ${f}`),
    '',
    '## Endpoint Checks',
    `- Health endpoint: ${hasHealth ? 'PASS' : 'FAIL'}`,
    `- Items CRUD endpoints: ${hasCrud ? 'PASS' : 'FAIL'}`,
    '',
    '## Project Files',
    ...files.map(f => `- ${f}`),
    ''
  ];
  if (blockers.length) audit.push('## Blockers', ...blockers.map(b => `- ${b}`), '');
  audit.push('## npm test output', '```', (test.stdout || test.stderr || 'no output').trim(), '```', '');

  const text = audit.join('\n');
  writeFileSync(auditPath, text.endsWith('\n') ? text : `${text}\n`);
  return { pass, text, testStatus: test.status, files };
}

export function runProjectTests(projectDir) {
  if (!existsSync(join(projectDir, 'package.json'))) throw new Error('package.json missing');
  const result = spawnSync('npm', ['test', '--silent'], { cwd: projectDir, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}
