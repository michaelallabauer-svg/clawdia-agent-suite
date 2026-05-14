import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const COPY_EXCLUDES = [
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.DS_Store'
];

export function copyExistingProject({ sourceDir, projectDir }) {
  const source = resolve(sourceDir);
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`existing project source not found or not a directory: ${source}`);
  }
  mkdirSync(projectDir, { recursive: true });
  const args = [
    ...COPY_EXCLUDES.flatMap(name => ['--exclude', name]),
    '-cf',
    '-',
    '-C',
    source,
    '.'
  ];
  const pack = spawnSync('tar', args, { encoding: 'buffer', maxBuffer: 200 * 1024 * 1024 });
  if (pack.status !== 0) throw new Error(`failed to archive existing project: ${pack.stderr?.toString() || pack.status}`);
  const unpack = spawnSync('tar', ['-xf', '-', '-C', projectDir], {
    input: pack.stdout,
    encoding: 'buffer',
    maxBuffer: 200 * 1024 * 1024
  });
  if (unpack.status !== 0) throw new Error(`failed to unpack existing project: ${unpack.stderr?.toString() || unpack.status}`);
  return { source, projectDir, excluded: COPY_EXCLUDES };
}

export function listProjectFiles(projectDir, { max = 400 } = {}) {
  const files = [];
  function walk(dir) {
    if (!existsSync(dir) || files.length >= max) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (COPY_EXCLUDES.includes(entry.name)) continue;
      const path = join(dir, entry.name);
      const rel = path.replace(projectDir + '/', '');
      if (entry.isDirectory()) walk(path);
      else files.push({ path: rel, size: statSync(path).size });
      if (files.length >= max) break;
    }
  }
  walk(projectDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function readPackageSummary(projectDir) {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return {
      name: pkg.name || null,
      version: pkg.version || null,
      scripts: pkg.scripts || {},
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {})
    };
  } catch (err) {
    return { parseError: err instanceof Error ? err.message : String(err) };
  }
}

export function writeExistingProjectManifest({ runDir, sourceDir, projectDir }) {
  const manifest = {
    mode: 'existing-project',
    sourceProjectDir: resolve(sourceDir),
    sourceProjectName: basename(resolve(sourceDir)),
    projectDir,
    copiedAt: new Date().toISOString(),
    copyExcludes: COPY_EXCLUDES,
    package: readPackageSummary(projectDir),
    files: listProjectFiles(projectDir)
  };
  writeFileSync(join(runDir, 'project_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function createExistingProjectChronistProtocol({ input, manifest }) {
  const pkg = manifest.package;
  const scripts = pkg?.scripts ? Object.entries(pkg.scripts).map(([k, v]) => `  - ${k}: ${v}`).join('\n') : '  - keine package.json scripts erkannt';
  const files = manifest.files.slice(0, 120).map(f => `  - ${f.path} (${f.size} bytes)`).join('\n');
  return `# Chronist-Protokoll: Existing Project Ticket

## 💡 Auftrag
${input.trim()}

## 🧭 Arbeitsmodus
- Modus: Existing-project CAS run.
- Quellprojekt: ${manifest.sourceProjectDir}
- Arbeitskopie: ${manifest.projectDir}
- Änderungen müssen ausschließlich in der Arbeitskopie erfolgen.
- Der Original-Repo-Ordner wird nicht direkt verändert.

## 📦 Projekt-Snapshot
- Projektname: ${manifest.sourceProjectName}
- package.json: ${pkg ? 'vorhanden' : 'nicht erkannt'}
${pkg?.parseError ? `- package.json Parse-Fehler: ${pkg.parseError}\n` : ''}${pkg?.name ? `- npm package: ${pkg.name}\n` : ''}
## npm Scripts
${scripts}

## Datei-Inventar (Auszug)
${files || '  - keine Dateien erkannt'}

## ❓ Klärungs-/Risiko-Punkte
- Änderungen sollten klein, ticketbasiert und testbar sein.
- Falls Tests fehlen, soll Arcanist einen minimalen Verifikationspfad spezifizieren.
- Falls der aktuelle Stand nicht startbar ist, zuerst Entry-Points/Imports/Smoke-Test stabilisieren.

## 🧭 Übergabe an Arcanist
- Erstelle eine konkrete, kleine, ausführbare Spezifikation für genau diesen Auftrag.
- Beschreibe Akzeptanzkriterien, betroffene Dateien, Test-/Smoke-Kommandos und Rollback-Hinweise.
- Behandle das Projekt als bestehende Codebasis, nicht als Greenfield-App.
`;
}

export function runExistingProjectAudit({ projectDir, auditPath }) {
  const files = listProjectFiles(projectDir, { max: 800 });
  const pkg = readPackageSummary(projectDir);
  const blockers = [];
  let testResult = null;
  if (pkg?.parseError) blockers.push(`package.json parse error: ${pkg.parseError}`);
  if (pkg && !pkg.parseError) {
    if (pkg.scripts?.test) {
      const res = spawnSync('npm', ['test', '--silent'], { cwd: projectDir, encoding: 'utf8', timeout: 180_000, maxBuffer: 30 * 1024 * 1024 });
      testResult = { command: 'npm test --silent', status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
      if (res.status !== 0) blockers.push('npm test failed');
    } else {
      blockers.push('package.json has no test script');
    }
  } else {
    blockers.push('no package.json detected; generic audit cannot run project tests');
  }
  if (!files.length) blockers.push('project working copy is empty');

  const pass = blockers.length === 0;
  const text = [
    '# Seer Existing-Project Audit',
    '',
    `CAS_STATUS: ${pass ? 'PASS' : 'FAIL'}`,
    '',
    '## Summary',
    `- Status: ${pass ? 'PASS' : 'FAIL'}`,
    `- Files checked: ${files.length}`,
    `- Test command: ${testResult?.command || 'not available'}`,
    `- Test result: ${testResult ? (testResult.status === 0 ? 'PASS' : 'FAIL') : 'SKIPPED'}`,
    '',
    '## Blockers',
    ...(blockers.length ? blockers.map(b => `- ${b}`) : ['- none']),
    '',
    '## Project Files',
    ...files.map(f => `- ${f.path} (${f.size} bytes)`),
    '',
    '## Test stdout',
    '```',
    (testResult?.stdout || '').trim() || '—',
    '```',
    '',
    '## Test stderr',
    '```',
    (testResult?.stderr || '').trim() || '—',
    '```',
    ''
  ].join('\n');
  writeFileSync(auditPath, text.endsWith('\n') ? text : `${text}\n`);
  return { pass, text, testResult, files };
}
