let selectedRun = null;
const $ = id => document.getElementById(id);

async function api(path, options) {
  const res = await fetch(path, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(data?.error || text || res.statusText);
  return data;
}
function badgeClass(status) { return ['passed','failed','running'].includes(status) ? status : ''; }
function fmtTime(ms) { return ms ? new Date(ms).toLocaleString() : '—'; }

async function loadRuns() {
  const { runs } = await api('/api/runs');
  const box = $('runs');
  box.innerHTML = '';
  for (const run of runs) {
    const div = document.createElement('div');
    div.className = `run ${selectedRun === run.runId ? 'active' : ''}`;
    div.innerHTML = `<strong>${run.runId}</strong><small>${run.status} · ${run.currentStep} · ${fmtTime(run.mtimeMs)}</small>`;
    div.onclick = () => selectRun(run.runId);
    box.appendChild(div);
  }
  if (selectedRun) await renderDetail(selectedRun).catch(console.error);
}

async function selectRun(runId) { selectedRun = runId; await loadRuns(); await renderDetail(runId); }
async function renderDetail(runId) {
  const run = await api(`/api/runs/${encodeURIComponent(runId)}`);
  $('detailEmpty').hidden = true; $('detail').hidden = false;
  $('runId').textContent = run.runId;
  $('status').textContent = run.status;
  $('status').className = `badge ${badgeClass(run.status)}`;
  $('step').textContent = run.currentStep;
  $('mode').textContent = run.mode || 'agentic';
  $('mode').className = `modeBadge ${run.mode || 'agentic'}`;
  $('runDir').textContent = run.runDir;
  $('projectDir').textContent = run.projectDir;
  $('sourceProjectDir').textContent = run.sourceProjectDir || '—';
  $('lastError').textContent = run.lastError || '—';
  const buttons = $('artifactButtons'); buttons.innerHTML = '';
  for (const key of ['input','chronist','spec','buildReport','audit','projectManifest','state','stdout','stderr','start']) {
    const b = document.createElement('button');
    b.textContent = key;
    b.disabled = !run.files[key];
    b.onclick = () => loadArtifact(runId, key);
    buttons.appendChild(b);
  }
}
async function loadArtifact(runId, key) {
  const data = await api(`/api/runs/${encodeURIComponent(runId)}/artifact/${encodeURIComponent(key)}`);
  $('artifactText').textContent = data.text;
}

$('refresh').onclick = loadRuns;
$('start').onclick = async () => {
  $('startResult').textContent = 'Starte…';
  try {
    const data = await api('/api/start', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ input:$('input').value, title:$('title').value, project:$('project').value.trim(), maxIterations:Number($('maxIterations').value || 2) }) });
    $('startResult').textContent = JSON.stringify(data, null, 2);
    selectedRun = data.runId;
    await loadRuns(); await renderDetail(data.runId);
  } catch (err) { $('startResult').textContent = err.message; }
};
$('manualStart').onclick = async () => {
  if (!selectedRun) return;
  $('manualResult').textContent = 'Starte manuellen Schritt…';
  try {
    const data = await api(`/api/runs/${encodeURIComponent(selectedRun)}/manual-step`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ agent:$('manualAgent').value, note:$('manualNote').value }) });
    $('manualResult').textContent = JSON.stringify(data, null, 2);
    await loadRuns();
  } catch (err) { $('manualResult').textContent = err.message; }
};
$('loadProject').onclick = async () => {
  if (!selectedRun) return;
  try {
    const data = await api(`/api/runs/${encodeURIComponent(selectedRun)}/project`);
    $('projectFiles').textContent = data.files.length ? data.files.map(f => `${f.path} (${f.size} bytes)`).join('\n') : 'Noch keine Projektdateien.';
  } catch (err) { $('projectFiles').textContent = err.message; }
};

$('openFinder').onclick = async () => {
  if (!selectedRun) return;
  try {
    const data = await api(`/api/runs/${encodeURIComponent(selectedRun)}/open-finder`, { method:'POST' });
    $('projectFiles').textContent = `Finder geöffnet:
${data.projectDir}`;
  } catch (err) { $('projectFiles').textContent = err.message; }
};

$('runTests').onclick = async () => {
  if (!selectedRun) return;
  $('projectFiles').textContent = 'Tests laufen…';
  try {
    const data = await api(`/api/runs/${encodeURIComponent(selectedRun)}/test`, { method:'POST' });
    $('projectFiles').textContent = `Test result: ${data.ok ? 'PASS' : 'FAIL'}
Exit: ${data.status}
Log: ${data.logPath}

STDOUT:
${data.stdout || '—'}

STDERR:
${data.stderr || '—'}`;
  } catch (err) { $('projectFiles').textContent = err.message; }
};

$('deleteRun').onclick = async () => {
  if (!selectedRun) return;
  const runId = selectedRun;
  if (!confirm(`Run wirklich löschen/archivieren?\n\n${runId}\n\nDer Ordner wird nach runs/.trash verschoben.`)) return;
  try {
    const data = await api(`/api/runs/${encodeURIComponent(runId)}`, { method:'DELETE' });
    selectedRun = null;
    $('detail').hidden = true;
    $('detailEmpty').hidden = false;
    $('startResult').textContent = `Run verschoben nach:\n${data.trashedTo}`;
    await loadRuns();
  } catch (err) { $('projectFiles').textContent = err.message; }
};


loadRuns();
setInterval(loadRuns, 5000);
