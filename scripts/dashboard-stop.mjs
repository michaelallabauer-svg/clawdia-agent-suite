#!/usr/bin/env node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pidFile = join(repo, 'logs', 'dashboard.pid');

if (!existsSync(pidFile)) {
  console.log('CAS dashboard pid file not found; nothing to stop.');
  process.exit(0);
}

const pid = Number(readFileSync(pidFile, 'utf8').trim());
if (!pid) {
  rmSync(pidFile, { force: true });
  console.log('CAS dashboard pid file was invalid; removed it.');
  process.exit(0);
}

try {
  process.kill(pid, 'SIGTERM');
  console.log(`CAS dashboard stopped: pid=${pid}`);
} catch (err) {
  if (err.code === 'ESRCH') console.log(`CAS dashboard was not running: pid=${pid}`);
  else throw err;
} finally {
  rmSync(pidFile, { force: true });
}
