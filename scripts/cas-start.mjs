#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const inputArg = args.find(a => a === '--input') ? args[args.indexOf('--input') + 1] : args.join(' ').trim();
const titleArg = args.find(a => a === '--title') ? args[args.indexOf('--title') + 1] : null;
const maxIterations = args.find(a => a === '--max-iterations') ? args[args.indexOf('--max-iterations') + 1] : '2';

if (!inputArg) {
  console.error('Usage: node scripts/cas-start.mjs --input <text-or-file> [--title slug] [--max-iterations 2]');
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const slugSource = titleArg || inputArg;
const slug = slugSource.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'cas-run';
const runId = `${stamp}-${slug}`;
const runDir = resolve(repo, 'runs', runId);
mkdirSync(runDir, { recursive: true });

const stdoutPath = join(runDir, 'runner.stdout.log');
const stderrPath = join(runDir, 'runner.stderr.log');
writeFileSync(join(runDir, 'start.json'), JSON.stringify({
  runId,
  runDir,
  startedAt: new Date().toISOString(),
  title: titleArg || slug,
  maxIterations: Number(maxIterations),
  status: 'started'
}, null, 2) + '\n');

const out = openSync(stdoutPath, 'a');
const err = openSync(stderrPath, 'a');
const child = spawn(process.execPath, [
  join(repo, 'scripts', 'cas-runner.mjs'),
  '--input', inputArg,
  '--title', titleArg || slug,
  '--max-iterations', String(maxIterations),
  '--run-id', runId
], {
  cwd: repo,
  detached: true,
  stdio: ['ignore', out, err]
});
child.unref();

console.log(JSON.stringify({
  ok: true,
  runId,
  pid: child.pid,
  runDir,
  projectDir: join(runDir, 'project'),
  stateFile: join(runDir, 'state.json'),
  stdout: stdoutPath,
  stderr: stderrPath
}, null, 2));
