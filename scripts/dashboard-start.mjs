#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logsDir = join(repo, 'logs');
const pidFile = join(logsDir, 'dashboard.pid');
const logFile = join(logsDir, 'dashboard.log');
const port = process.env.CAS_DASHBOARD_PORT || '17888';
const host = process.env.CAS_DASHBOARD_HOST || '0.0.0.0';

mkdirSync(logsDir, { recursive: true });

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (existsSync(pidFile)) {
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (pid && isAlive(pid)) {
    console.log(`CAS dashboard already running: pid=${pid}, url=http://127.0.0.1:${port}`);
    process.exit(0);
  }
}

appendFileSync(logFile, `\n--- starting dashboard ${new Date().toISOString()} host=${host} port=${port} ---\n`);
const out = await import('node:fs').then(fs => fs.openSync(logFile, 'a'));
const child = spawn(process.execPath, [join(repo, 'dashboard', 'server.mjs')], {
  cwd: repo,
  detached: true,
  stdio: ['ignore', out, out],
  env: { ...process.env, CAS_DASHBOARD_HOST: host, CAS_DASHBOARD_PORT: port }
});
child.unref();
writeFileSync(pidFile, `${child.pid}\n`);
console.log(`CAS dashboard started: pid=${child.pid}, url=http://127.0.0.1:${port}`);
