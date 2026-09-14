import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROADMAP_MD = resolve(ROOT, 'docs/project/PROJECT_ROADMAP.md');
const ROADMAP_HTML = resolve(ROOT, 'docs/project/PROJECT_ROADMAP.html');
const ACTIVE_TASK_DIR = resolve(ROOT, 'tasks/active');
const DONE_TASK_DIR = resolve(ROOT, 'tasks/done');
const EXPECTED_FIRST_TASK = 0;
const EXPECTED_LAST_TASK = 86;
const STATUS_VOCABULARY = ['PLANNED', 'DRAFT', 'READY', 'ACTIVE', 'REVIEW', 'FIX', 'ACCEPTANCE', 'DONE', 'BLOCKED', 'DEFERRED'];

function fail(message) {
  throw new Error(message);
}

function readUtf8(path) {
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8');
  if (text.includes('\uFFFD') || !bytes.equals(Buffer.from(text, 'utf8'))) {
    fail(`${path} is not valid round-trip UTF-8`);
  }
  return { bytes, text, normalized: text.replace(/\r\n?/g, '\n') };
}

function validateTextFormat(text, label) {
  const errors = [];
  if (/[ \t]+$/m.test(text)) errors.push('trailing whitespace');
  if (!text.endsWith('\n')) errors.push('missing final newline');
  if (text.endsWith('\n\n')) errors.push('extra blank line at EOF');
  if (errors.length) fail(`${label} format validation failed: ${errors.join(', ')}`);
}

function stripInline(value) {
  return value
    .trim()
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .trim();
}

function tableCells(line) {
  if (!line.trimStart().startsWith('|')) return null;
  const trimmed = line.trim();
  if (!trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells?.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function section(lines, startMarker, endMarker) {
  const start = lines.findIndex((line) => line.startsWith(startMarker));
  if (start < 0) fail(`Missing section: ${startMarker}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith(endMarker));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

function extractCodeBlock(lines, headingPrefix) {
  const heading = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (heading < 0) fail(`Missing heading: ${headingPrefix}`);
  const open = lines.findIndex((line, index) => index > heading && line.trim() === '```text');
  if (open < 0) fail(`Missing text code block after ${headingPrefix}`);
  const close = lines.findIndex((line, index) => index > open && line.trim() === '```');
  if (close < 0) fail(`Unclosed text code block after ${headingPrefix}`);
  return lines.slice(open + 1, close).join('\n').trim();
}

function parseRoadmap(markdown) {
  const lines = markdown.split('\n');
  const epics = [];
  const stories = [];
  const tasks = [];
  let currentEpic = null;
  let currentStory = null;
  let inDetailedRoadmap = false;

  for (const line of lines) {
    if (line === '## 8. Detailed roadmap') {
      inDetailedRoadmap = true;
      continue;
    }

    const epicMatch = line.match(/^### (EPIC-\d{2}) — (.+)$/);
    if (epicMatch) {
      currentEpic = { id: epicMatch[1], title: epicMatch[2].trim(), status: '', outcome: '' };
      epics.push(currentEpic);
      currentStory = null;
      continue;
    }

    const storyMatch = line.match(/^#### (STORY-\d{2}\.\d+) — (.+)$/);
    if (storyMatch) {
      if (!currentEpic) fail(`${storyMatch[1]} appears before an Epic`);
      currentStory = { id: storyMatch[1], title: storyMatch[2].trim(), epic: currentEpic.id };
      stories.push(currentStory);
      continue;
    }

    if (currentEpic && !currentEpic.status) {
      const statusMatch = line.match(/^\*\*Status:\*\*\s*(.+?)\s{0,2}$/);
      if (statusMatch) currentEpic.status = stripInline(statusMatch[1]);
    }
    if (currentEpic && !currentEpic.outcome) {
      const outcomeMatch = line.match(/^\*\*Outcome:\*\*\s*(.+?)\s{0,2}$/);
      if (outcomeMatch) currentEpic.outcome = stripInline(outcomeMatch[1]);
    }

    if (!inDetailedRoadmap || !line.startsWith('| `TASK-')) continue;
    if (!currentEpic || !currentStory) fail(`Task row is outside an Epic/Story: ${line}`);
    const cells = tableCells(line);
    if (!cells || cells.length !== 9) fail(`Task row must have 9 columns: ${line}`);
    const taskMatch = cells[0].match(/^`(TASK-\d{3})`\s+(.+)$/);
    if (!taskMatch) fail(`Invalid task cell: ${cells[0]}`);
    tasks.push({
      id: taskMatch[1],
      title: stripInline(taskMatch[2]),
      class: stripInline(cells[1]),
      status: stripInline(cells[2]),
      owner: stripInline(cells[3]),
      review: stripInline(cells[4]),
      skills: stripInline(cells[5]),
      human: stripInline(cells[6]),
      dependencies: stripInline(cells[7]),
      subtasks: stripInline(cells[8]),
      epic: currentEpic.id,
      story: currentStory.id,
    });
  }

  const roles = section(lines, '## 4. Canonical roles and execution agents', '## 5. External skill adoption policy')
    .map(tableCells)
    .filter((cells) => cells && cells.length === 4 && !isSeparatorRow(cells) && cells[0] !== 'Code')
    .map((cells) => ({ code: stripInline(cells[0]), role: stripInline(cells[1]), agent: stripInline(cells[2]), use: stripInline(cells[3]) }));

  const skills = section(lines, '### Curated skill catalog', '### Explicitly not adopted by default')
    .map(tableCells)
    .filter((cells) => cells && cells.length === 5 && !isSeparatorRow(cells) && cells[0] !== 'Code')
    .map((cells) => ({ code: stripInline(cells[0]), skill: stripInline(cells[1]), stage: stripInline(cells[2]), adoption: stripInline(cells[3]), source: stripInline(cells[4]) }));

  const currentActionLine = lines.find((line) => line.startsWith('**Current action:**'));
  const nextTaskLine = lines.find((line) => line.startsWith('**Next task after TASK-003 acceptance:**'));
  if (!currentActionLine) fail('Missing **Current action:** in roadmap current-position section');
  if (!nextTaskLine) fail('Missing **Next task after TASK-003 acceptance:** in roadmap current-position section');

  return {
    epics,
    stories,
    tasks,
    roles,
    skills,
    currentAction: stripInline(currentActionLine.replace('**Current action:**', '')),
    nextTask: stripInline(nextTaskLine.replace('**Next task after TASK-003 acceptance:**', '')),
    statusVocabulary: STATUS_VOCABULARY,
    milestoneText: extractCodeBlock(lines, '## 7. Milestone sequence'),
    criticalPathText: extractCodeBlock(lines, '## 9. Dependency / parallelization map'),
  };
}

function expandTaskRefs(text) {
  const refs = new Set();
  const pattern = /TASK-(\d{3})(?:([–-])(\d{3}))?((?:\/\d{3})*)/g;
  for (const match of text.matchAll(pattern)) {
    const start = Number(match[1]);
    refs.add(`TASK-${String(start).padStart(3, '0')}`);
    if (match[3]) {
      const end = Number(match[3]);
      if (end < start || end - start > 200) fail(`Invalid task range in dependency: ${match[0]}`);
      for (let value = start + 1; value <= end; value += 1) refs.add(`TASK-${String(value).padStart(3, '0')}`);
    }
    if (match[4]) {
      for (const suffix of match[4].slice(1).split('/')) refs.add(`TASK-${suffix}`);
    }
  }
  return [...refs];
}

function taskStateFromFile(path) {
  const { normalized } = readUtf8(path);
  const match = normalized.match(/^- State:\s*(\S+)\s*$/m);
  if (!match) fail(`${path} is missing State metadata`);
  return match[1];
}

function taskFilesById(directory) {
  const files = new Map();
  for (const name of readdirSync(directory)) {
    const match = name.match(/^(TASK-\d{3})-.+\.md$/);
    if (match) files.set(match[1], resolve(directory, name));
  }
  return files;
}

function validateRoadmap(data) {
  const errors = [];
  const taskById = new Map();
  const skillCodes = new Set(data.skills.map((skill) => skill.code));
  const roleCodes = new Set(data.roles.map((role) => role.code));
  const allowedStates = new Set(STATUS_VOCABULARY);

  for (const task of data.tasks) {
    if (taskById.has(task.id)) errors.push(`Duplicate task ID: ${task.id}`);
    taskById.set(task.id, task);
    if (!['A', 'B', 'C'].includes(task.class)) errors.push(`${task.id}: invalid class ${task.class}`);
    if (!allowedStates.has(task.status)) errors.push(`${task.id}: invalid state ${task.status}`);
    for (const field of ['owner', 'review', 'skills', 'human', 'dependencies', 'subtasks']) {
      if (!task[field]) errors.push(`${task.id}: missing ${field}`);
    }
    const ownerRole = task.owner.split('→')[0].trim();
    if (!roleCodes.has(ownerRole)) errors.push(`${task.id}: owner role ${ownerRole} is not in the canonical role table`);
    for (const skillCode of task.skills.match(/SK-[A-Z0-9-]+/g) ?? []) {
      if (!skillCodes.has(skillCode)) errors.push(`${task.id}: unknown skill ${skillCode}`);
    }
  }

  const expectedIds = [];
  for (let value = EXPECTED_FIRST_TASK; value <= EXPECTED_LAST_TASK; value += 1) expectedIds.push(`TASK-${String(value).padStart(3, '0')}`);
  if (data.tasks.length !== expectedIds.length) errors.push(`Expected ${expectedIds.length} tasks, found ${data.tasks.length}`);
  expectedIds.forEach((id, index) => {
    if (!taskById.has(id)) errors.push(`Missing task ID: ${id}`);
    if (data.tasks[index]?.id !== id) errors.push(`Task ordering error at index ${index}: expected ${id}, found ${data.tasks[index]?.id ?? 'none'}`);
  });

  const activeFiles = taskFilesById(ACTIVE_TASK_DIR);
  const doneFiles = taskFilesById(DONE_TASK_DIR);
  for (const [id, path] of activeFiles) {
    const roadmapState = taskById.get(id)?.status;
    if (!roadmapState) errors.push(`${id}: active task file exists but roadmap row is missing`);
    else {
      const fileState = taskStateFromFile(path);
      if (roadmapState !== fileState) errors.push(`${id} state mismatch: roadmap=${roadmapState}, active task=${fileState}`);
    }
  }
  for (const [id] of doneFiles) if (taskById.has(id) && taskById.get(id).status !== 'DONE') errors.push(`${id}: done task file exists but roadmap state is ${taskById.get(id).status}`);
  for (const task of data.tasks) {
    if (task.status === 'DONE' && !doneFiles.has(task.id)) errors.push(`${task.id}: roadmap says DONE but tasks/done file is missing`);
    if (!['PLANNED', 'DONE'].includes(task.status) && !activeFiles.has(task.id)) errors.push(`${task.id}: state ${task.status} requires a materialized tasks/active file`);
  }

  const graph = new Map();
  for (const task of data.tasks) {
    const refs = expandTaskRefs(task.dependencies);
    graph.set(task.id, refs);
    for (const ref of refs) {
      if (!taskById.has(ref)) errors.push(`${task.id}: dependency references missing ${ref}`);
      if (ref === task.id) errors.push(`${task.id}: self dependency`);
      if (taskById.has(ref) && Number(ref.slice(5)) > Number(task.id.slice(5))) errors.push(`${task.id}: dependency ${ref} appears later in the sequential roadmap`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail) {
    if (visiting.has(id)) {
      errors.push(`Dependency cycle: ${[...trail, id].join(' -> ')}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) if (graph.has(dep)) visit(dep, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id, []);

  const epicIds = new Set(data.epics.map((epic) => epic.id));
  const storyIds = new Set(data.stories.map((story) => story.id));
  if (epicIds.size !== data.epics.length) errors.push('Duplicate Epic IDs');
  if (storyIds.size !== data.stories.length) errors.push('Duplicate Story IDs');
  data.epics.forEach((epic, index) => {
    const expected = `EPIC-${String(index).padStart(2, '0')}`;
    if (epic.id !== expected) errors.push(`Epic ordering error: expected ${expected}, found ${epic.id}`);
  });
  for (const epic of data.epics) {
    const epicStories = data.stories.filter((story) => story.epic === epic.id);
    epicStories.forEach((story, index) => {
      const expected = `STORY-${epic.id.slice(5)}.${index + 1}`;
      if (story.id !== expected) errors.push(`Story ordering error in ${epic.id}: expected ${expected}, found ${story.id}`);
    });
  }
  for (const task of data.tasks) {
    if (!epicIds.has(task.epic)) errors.push(`${task.id}: missing Epic ${task.epic}`);
    if (!storyIds.has(task.story)) errors.push(`${task.id}: missing Story ${task.story}`);
  }

  if (errors.length) fail(`Roadmap validation failed:\n- ${errors.join('\n- ')}`);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function renderHtml(data, sourceHash) {
  const payload = JSON.stringify({ ...data, sourceHash })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="roadmap-source-sha256" content="${sourceHash}">
<title>PokeNexus Idle — Project Roadmap</title>
<style>
:root{--bg:#0b1017;--panel:#121923;--panel2:#182230;--line:#26364a;--text:#e9f0f7;--muted:#93a4b7;--accent:#62d3ff;--good:#64d98b;--active:#ffd166;--human:#ff9e64;--aclass:#ca9cff;--shadow:0 14px 38px rgba(0,0,0,.28)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#081019,#0d141d 35%,#0b1017);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}a{color:var(--accent)}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.wrap{max-width:1500px;margin:auto;padding:22px}.hero{border:1px solid var(--line);background:linear-gradient(135deg,#132131,#101720);border-radius:14px;padding:24px;box-shadow:var(--shadow)}h1{font-size:30px;margin:0 0 6px}.kicker{color:var(--accent);text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:11px}.muted{color:var(--muted)}.notice{margin-top:14px;border-left:3px solid var(--active);background:#171a1c;padding:10px 12px;border-radius:5px}.combat{margin-top:14px;border:1px solid #32506a;background:#0d2030;padding:12px 14px;border-radius:9px}.stats{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin:16px 0}.stat,.section-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}.stat b{font-size:22px;display:block}.progress{height:8px;background:#1b2734;border-radius:99px;overflow:hidden;margin-top:8px}.progress i{display:block;height:100%;background:var(--good)}.overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.overview h3{margin:0 0 8px}.overview pre{white-space:pre-wrap;margin:0;color:#cbd6e2;font-size:11px}.queue{display:flex;gap:6px;flex-wrap:wrap}.queue a{border:1px solid #8a573b;border-radius:99px;padding:4px 8px;text-decoration:none;color:var(--human);font-size:11px}.controls{position:sticky;top:0;z-index:9;margin:18px 0;padding:12px;background:rgba(11,16,23,.94);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:10px;display:flex;gap:9px;flex-wrap:wrap;align-items:center}input,select,button{background:#101823;color:var(--text);border:1px solid #34475d;border-radius:7px;padding:8px 10px}input[type=search]{min-width:280px;flex:1}button{cursor:pointer}label.toggle{display:flex;gap:7px;align-items:center;color:var(--muted)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}details{border:1px solid var(--line);background:var(--panel);border-radius:10px;margin:10px 0;overflow:hidden}summary{cursor:pointer;list-style:none;padding:13px 15px;font-weight:700}summary::-webkit-details-marker{display:none}details[open]>summary{border-bottom:1px solid var(--line);background:#151f2b}.epic>summary{font-size:17px}.epic-body{padding:4px 12px 12px}.epic-meta{color:var(--muted);padding:10px 4px 0}.story{background:#0f1620}.story>summary{color:#dce9f4}.tasks{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:10px;padding:10px}.task{border:1px solid #2a3c50;background:var(--panel2);border-radius:9px;padding:12px;min-width:0;scroll-margin-top:90px}.task.active{box-shadow:0 0 0 2px rgba(255,209,102,.45)}.task-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.task-id{font:700 12px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--accent);text-decoration:none}.task h4{margin:4px 0 9px;font-size:15px}.badges{display:flex;gap:5px;flex-wrap:wrap}.badge{font-size:10px;letter-spacing:.05em;text-transform:uppercase;border:1px solid #3b4b60;border-radius:99px;padding:2px 7px;color:#cbd6e2;white-space:nowrap}.badge.done{border-color:#356e49;color:var(--good)}.badge.active,.badge.review,.badge.acceptance,.badge.fix{border-color:#806d32;color:var(--active)}.badge.human{border-color:#8a573b;color:var(--human)}.badge.classa{border-color:#654f81;color:var(--aclass)}.meta{display:grid;grid-template-columns:86px 1fr;gap:5px 8px;margin-top:10px;font-size:12px}.meta dt{color:var(--muted)}.meta dd{margin:0;overflow-wrap:anywhere}.subs{margin-top:9px;padding-top:8px;border-top:1px solid #29394a;color:#bfccda;font-size:12px}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:#9fb0c2;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.hidden{display:none!important}.empty{padding:30px;text-align:center;color:var(--muted)}.source{margin:18px 0;color:var(--muted);font-size:11px;overflow-wrap:anywhere}
@media(max-width:1000px){.overview{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}}
@media(max-width:850px){.grid2{grid-template-columns:1fr}.wrap{padding:12px}input[type=search]{min-width:180px}}
@media print{body{background:white;color:#111}.controls{display:none}details{break-inside:avoid;background:white}details>*{display:block!important}}
</style>
</head>
<body>
<div class="wrap">
<section class="hero">
<div class="kicker">PokeNexus Idle · Project Control</div>
<h1>Roadmap completo</h1>
<div class="muted">Epic → Story → Task → Sub-task · roles, agents, skills, dependências e gates humanos.</div>
<div class="notice"><strong>Fonte canônica:</strong> <code>docs/project/PROJECT_ROADMAP.md</code>. Este HTML é gerado deterministicamente; em qualquer divergência, o Markdown vence. O SHA-256 usa Markdown UTF-8 normalizado para LF.</div>
<div class="combat"><strong>Invariante central:</strong> Solo Hunt, Duo, PvP, Gyms/Challenges, World Boss e futuros conteúdos de batalha usam o mesmo Combat Engine determinístico. Conteúdo configura/orquestra; não cria um segundo resolvedor.</div>
</section>
<section class="stats" id="stats"></section>
<section class="overview">
  <div class="section-card"><h3>Next Action</h3><div id="next-action"></div></div>
  <div class="section-card"><h3>Human Gate Queue</h3><div id="human-queue" class="queue"></div></div>
  <div class="section-card"><h3>Milestones</h3><pre>${esc(data.milestoneText)}</pre></div>
</section>
<details class="section-card"><summary>Critical path / dependency map</summary><pre>${esc(data.criticalPathText)}</pre></details>
<div class="controls">
<input id="q" type="search" placeholder="Buscar task, skill, owner, dependência…" aria-label="Buscar">
<select id="epic"><option value="">Todos os Epics</option></select>
<select id="status"><option value="">Todos os status</option></select>
<select id="class"><option value="">Todas as classes</option><option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option></select>
<select id="owner"><option value="">Todos os owners</option></select>
<label class="toggle"><input id="human" type="checkbox"> Somente gate humano</label>
<button id="expand">Expandir tudo</button><button id="collapse">Recolher</button>
</div>
<section class="grid2">
<details><summary>Roles & agents canônicos</summary><div class="tablewrap"><table id="roles"><thead><tr><th>Role</th><th>Responsabilidade</th><th>Agent/surface</th></tr></thead><tbody></tbody></table></div></details>
<details><summary>Skills externos curados</summary><div class="tablewrap"><table id="skills"><thead><tr><th>Skill</th><th>Aplicação</th><th>Adoção</th></tr></thead><tbody></tbody></table></div></details>
</section>
<section class="section-card"><strong>Estados:</strong> <span class="badge done">DONE</span> concluído · <span class="badge active">ACTIVE/REVIEW/FIX/ACCEPTANCE</span> trabalho corrente · <span class="badge">PLANNED</span> portfólio, ainda sem autorização de implementação · <span class="badge classa">Class A</span> decisão/alto impacto · <span class="badge human">HUMAN</span> validação final do Human Owner.</section>
<main id="roadmap"></main>
<div id="empty" class="empty hidden">Nenhuma task corresponde aos filtros atuais.</div>
<div class="source">Normalized Markdown SHA-256: <code>${sourceHash}</code></div>
</div>
<script>
const DATA=${payload};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const badge=(text,cls='')=>'<span class="badge '+esc(cls)+'">'+esc(text)+'</span>';
const isCurrent=status=>['ACTIVE','REVIEW','FIX','ACCEPTANCE'].includes(status);
function taskRefs(text){
  const refs=[]; const seen=new Set(); const pattern=/TASK-(\\d{3})(?:([–-])(\\d{3}))?((?:\\/\\d{3})*)/g;
  for(const match of String(text).matchAll(pattern)){
    const start=Number(match[1]); const values=[start];
    if(match[3]) for(let value=start+1;value<=Number(match[3]);value++) values.push(value);
    if(match[4]) for(const suffix of match[4].slice(1).split('/')) values.push(Number(suffix));
    for(const value of values){const id='TASK-'+String(value).padStart(3,'0'); if(!seen.has(id)){seen.add(id);refs.push(id)}}
  }
  return refs;
}
function taskTextHtml(text){
  const refs=taskRefs(text); if(!refs.length) return esc(text);
  return esc(text)+'<div>'+refs.map(id=>'<a href="#'+id+'">'+esc(id)+'</a>').join(' · ')+'</div>';
}
function initSummary(){
  const counts=Object.fromEntries([...new Set(DATA.tasks.map(t=>t.status))].map(status=>[status,DATA.tasks.filter(t=>t.status===status).length]));
  const done=counts.DONE??0; const pct=(done/DATA.tasks.length*100).toFixed(1);
  $('#stats').innerHTML='<div class="stat"><span class="muted">Tasks totais</span><b>'+DATA.tasks.length+'</b><small>'+esc(DATA.tasks[0].id)+' → '+esc(DATA.tasks.at(-1).id)+'</small></div>'+
    '<div class="stat"><span class="muted">DONE</span><b>'+done+'</b><small>'+pct+'% por contagem de tasks</small><div class="progress"><i style="width:'+pct+'%"></i></div></div>'+
    '<div class="stat"><span class="muted">REVIEW/FIX/ACTIVE</span><b>'+DATA.tasks.filter(t=>isCurrent(t.status)).length+'</b><small>trabalho corrente</small></div>'+
    '<div class="stat"><span class="muted">PLANNED</span><b>'+(counts.PLANNED??0)+'</b><small>viram DRAFT/READY apenas após gates</small></div>'+
    '<div class="stat"><span class="muted">Validador final</span><b>HO</b><small>Human Owner em todo gate humano</small></div>';
  $('#next-action').innerHTML='<div><b>Agora:</b> '+taskTextHtml(DATA.currentAction)+'</div><div class="muted"><b>Depois da aceitação:</b> '+taskTextHtml(DATA.nextTask)+'</div>';
  const humanTasks=DATA.tasks.filter(t=>t.status!=='DONE'&&/HUMAN/i.test(t.human));
  const ready=humanTasks.filter(t=>t.status==='ACCEPTANCE');
  const review=humanTasks.filter(t=>['ACTIVE','REVIEW','FIX'].includes(t.status));
  const future=humanTasks.filter(t=>!['ACTIVE','REVIEW','FIX','ACCEPTANCE'].includes(t.status)).slice(0,8);
  const group=(label,tasks)=>tasks.length?'<div><span class="muted">'+esc(label)+'</span><div class="queue">'+tasks.map(t=>'<a href="#'+t.id+'" title="'+esc(t.human)+'">'+esc(t.id)+'</a>').join('')+'</div></div>':'';
  $('#human-queue').innerHTML=group('Ready now',ready)+group('Current / review',review)+group('Future gates',future)||'Nenhum gate humano pendente.';
}
function initTables(){
  $('#roles tbody').innerHTML=DATA.roles.map(r=>'<tr><td><b>'+esc(r.code)+'</b><br>'+esc(r.role)+'</td><td>'+esc(r.use)+'</td><td>'+esc(r.agent)+'</td></tr>').join('');
  $('#skills tbody').innerHTML=DATA.skills.map(s=>'<tr><td><b>'+esc(s.code)+'</b><br>'+esc(s.skill)+'</td><td>'+esc(s.stage)+'</td><td>'+esc(s.adoption)+'<br><a href="'+esc(s.source)+'" target="_blank" rel="noreferrer">fonte</a></td></tr>').join('');
  $('#epic').innerHTML+=DATA.epics.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.id)+' · '+esc(e.title)+'</option>').join('');
  $('#status').innerHTML+=DATA.statusVocabulary.map(status=>'<option value="'+esc(status)+'">'+esc(status)+'</option>').join('');
  $('#owner').innerHTML+=[...new Set(DATA.tasks.map(t=>t.owner))].sort().map(owner=>'<option value="'+esc(owner)+'">'+esc(owner)+'</option>').join('');
}
function taskCard(t){
  const human=/HUMAN/i.test(t.human);
  return '<article id="'+esc(t.id)+'" class="task '+(isCurrent(t.status)?'active':'')+'"><div class="task-head"><div><a class="task-id" href="#'+esc(t.id)+'">'+esc(t.id)+'</a><h4>'+esc(t.title)+'</h4></div><div class="badges">'+badge(t.status,t.status.toLowerCase())+badge('Class '+t.class,t.class==='A'?'classa':'')+(human?badge('HUMAN','human'):'')+'</div></div><dl class="meta"><dt>Owner</dt><dd>'+esc(t.owner)+'</dd><dt>Review</dt><dd>'+esc(t.review)+'</dd><dt>Skills</dt><dd>'+esc(t.skills)+'</dd><dt>Human gate</dt><dd>'+esc(t.human)+'</dd><dt>Depends</dt><dd>'+taskTextHtml(t.dependencies)+'</dd></dl><div class="subs"><b>Sub-tasks:</b> '+esc(t.subtasks)+'</div></article>';
}
function render(){
  const query=$('#q').value.trim().toLowerCase(); const epicFilter=$('#epic').value; const statusFilter=$('#status').value; const classFilter=$('#class').value; const ownerFilter=$('#owner').value; const humanOnly=$('#human').checked;
  let visible=0,output='';
  for(const epic of DATA.epics){
    if(epicFilter&&epic.id!==epicFilter) continue;
    let storyHtml='',epicCount=0;
    for(const story of DATA.stories.filter(item=>item.epic===epic.id)){
      const matching=DATA.tasks.filter(task=>task.story===story.id).filter(task=>(!statusFilter||task.status===statusFilter)&&(!classFilter||task.class===classFilter)&&(!ownerFilter||task.owner===ownerFilter)&&(!humanOnly||/HUMAN/i.test(task.human))&&(!query||Object.values(task).join(' ').toLowerCase().includes(query)));
      if(!matching.length) continue;
      epicCount+=matching.length; visible+=matching.length;
      storyHtml+='<details class="story" '+(matching.some(t=>isCurrent(t.status))?'open':'')+'><summary>'+esc(story.id)+' · '+esc(story.title)+' <span class="muted">('+matching.length+')</span></summary><div class="tasks">'+matching.map(taskCard).join('')+'</div></details>';
    }
    if(!epicCount) continue;
    const open=epic.id==='EPIC-00'||DATA.tasks.some(task=>task.epic===epic.id&&isCurrent(task.status));
    output+='<details class="epic" '+(open?'open':'')+'><summary>'+esc(epic.id)+' · '+esc(epic.title)+' <span class="muted">('+epicCount+' tasks)</span></summary><div class="epic-body"><div class="epic-meta"><b>'+esc(epic.status)+'</b>'+(epic.outcome?' · '+esc(epic.outcome):'')+'</div>'+storyHtml+'</div></details>';
  }
  $('#roadmap').innerHTML=output; $('#empty').classList.toggle('hidden',visible>0);
}
initSummary(); initTables(); render();
['q','epic','status','class','owner','human'].forEach(id=>$('#'+id).addEventListener('input',render));
$('#expand').onclick=()=>document.querySelectorAll('#roadmap details').forEach(item=>item.open=true);
$('#collapse').onclick=()=>document.querySelectorAll('#roadmap details').forEach(item=>item.open=false);
</script>
</body>
</html>
`;
}

function assertStandaloneHtml(html, sourceHash) {
  const errors = [];
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) errors.push('external script dependency found');
  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(html)) errors.push('external stylesheet dependency found');
  if (/@import\s+/i.test(html)) errors.push('CSS @import dependency found');
  if (/\bfetch\s*\(/i.test(html)) errors.push('runtime fetch dependency found');
  if (/\bimport\s*\(/i.test(html)) errors.push('runtime dynamic import found');
  if (!html.includes(`name="roadmap-source-sha256" content="${sourceHash}"`)) errors.push('source SHA-256 meta missing or incorrect');
  const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!inlineScript) errors.push('inline dashboard script missing');
  else {
    try {
      new Script(inlineScript[1], { filename: 'PROJECT_ROADMAP.inline.js' });
    } catch (error) {
      errors.push(`inline dashboard script syntax error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length) fail(`HTML validation failed:\n- ${errors.join('\n- ')}`);
}

function build() {
  const md = readUtf8(ROADMAP_MD);
  validateTextFormat(md.normalized, 'PROJECT_ROADMAP.md');
  const data = parseRoadmap(md.normalized);
  validateRoadmap(data);
  const sourceHash = createHash('sha256').update(Buffer.from(md.normalized, 'utf8')).digest('hex');
  const html = renderHtml(data, sourceHash);
  assertStandaloneHtml(html, sourceHash);
  return { data, sourceHash, html };
}

function generate() {
  const result = build();
  writeFileSync(ROADMAP_HTML, result.html, 'utf8');
  console.log(`Generated PROJECT_ROADMAP.html from ${result.data.tasks.length} tasks (${result.sourceHash})`);
}

function check() {
  const result = build();
  const current = readUtf8(ROADMAP_HTML).normalized;
  assertStandaloneHtml(current, result.sourceHash);
  if (current !== result.html) fail('PROJECT_ROADMAP.html is stale; run roadmap:generate');
  console.log(`Roadmap check passed: ${result.data.tasks.length} tasks, source ${result.sourceHash}`);
}

const command = process.argv[2] ?? 'check';
try {
  if (command === 'generate') generate();
  else if (command === 'check') check();
  else fail(`Unknown command: ${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
