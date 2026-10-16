import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// This check deliberately reads the local multi-worktree workspace. CI clones
// generally have only one worktree, so project-roadmap.mjs owns the portable gate.
const BRANCH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
  cwd: BRANCH_ROOT,
  encoding: 'utf8',
}).trim();
const PROJECT_ROOT = dirname(resolve(BRANCH_ROOT, gitCommonDir));
const ROADMAP_MD = resolve(BRANCH_ROOT, 'docs/project/PROJECT_ROADMAP.md');
const LOCAL_ENTRY = resolve(PROJECT_ROOT, 'PROJECT_ROADMAP.html');
const LOCAL_SNAPSHOT_DIR = resolve(PROJECT_ROOT, '.maintenance/portfolio');
const INTEGRATED_SNAPSHOT = resolve(LOCAL_SNAPSHOT_DIR, 'PROJECT_ROADMAP.integrated-main.html');
const STATES = ['PLANNED', 'DRAFT', 'READY', 'ACTIVE', 'REVIEW', 'FIX', 'ACCEPTANCE', 'DONE', 'BLOCKED', 'DEFERRED'];

function loadUtf8(filename) {
  const bytes = readFileSync(filename);
  const content = bytes.toString('utf8');
  if (content.includes('\ufffd') || !Buffer.from(content, 'utf8').equals(bytes)) {
    throw new Error(`${filename}: invalid UTF-8`);
  }
  return content.replace(/\r\n?/g, '\n');
}

function readPortfolio(source) {
  const taskStatus = new Map();
  for (const match of source.matchAll(/^\| `(TASK-\d{3})`[^|]*\| [ABC] \| (PLANNED|DRAFT|READY|ACTIVE|REVIEW|FIX|ACCEPTANCE|DONE|BLOCKED|DEFERRED) \|/gm)) {
    if (taskStatus.has(match[1])) throw new Error(`Duplicated roadmap row: ${match[1]}`);
    taskStatus.set(match[1], match[2]);
  }
  const range = source.match(/^- Planned task IDs in this roadmap: `TASK-000` through `TASK-(\d{3})`\.$/m);
  if (!range) throw new Error('Missing explicit portfolio range');
  const expected = Number(range[1]) + 1;
  if (taskStatus.size !== expected) throw new Error(`Expected ${expected} roadmap rows; found ${taskStatus.size}`);
  for (let index = 0; index < expected; index += 1) {
    const taskId = `TASK-${String(index).padStart(3, '0')}`;
    if (!taskStatus.has(taskId)) throw new Error(`Missing contiguous roadmap identity ${taskId}`);
  }
  const counts = { total: expected };
  for (const status of STATES) {
    const line = source.match(new RegExp(`^- ${status}: (\\d+)\\.$`, 'm'));
    if (!line) throw new Error(`Missing portfolio count: ${status}`);
    counts[status.toLowerCase()] = Number(line[1]);
    const actual = [...taskStatus.values()].filter((state) => state === status).length;
    if (counts[status.toLowerCase()] !== actual) throw new Error(`${status}: summary ${line[1]}, rows ${actual}`);
  }
  return { counts, taskStatus };
}

function localHref(filename) {
  return relative(PROJECT_ROOT, filename).split(sep).join('/');
}

function readLanding(html, expected, hash, requiredRefs = [], sourceIndices = null) {
  const errors = [];
  if (html.includes('location.replace(')) errors.push('legacy automatic redirect');
  if (!html.includes(`<meta name="pokenexus-portfolio-source-sha256" content="${hash}">`)) {
    errors.push('local landing is not stamped with the current reconciled Markdown SHA-256');
  }
  for (const key of ['total', 'done', 'active', 'acceptance']) {
    if (!html.includes(`data-portfolio="${key}"><b>${expected[key]}</b>`)) {
      errors.push(`local landing metric ${key} does not match reconciled roadmap (${expected[key]})`);
    }
  }
  if (sourceIndices) {
    if (!html.includes(`data-source-index-count="${sourceIndices.items.length}"`)) {
      errors.push('isolated source task count does not match current verified source indices');
    }
    if (!html.includes(`data-source-index-sha256="${sourceIndices.hash}"`)) {
      errors.push('isolated source lifecycle/owner identity signature is stale');
    }
    if (!html.includes(`SHA-256 do manifesto e metadados de identidade/lifecycle: <code>${sourceIndices.hash}</code>`)) {
      errors.push('visible isolated source signature is missing or stale');
    }
    for (const item of sourceIndices.items) {
      const visible = `<p><code>${item.id}</code> — source <b>${item.lifecycle}</b> em <code>${item.worktree}</code>; integração no main bloqueada.</p>`;
      if (!html.includes(visible)) errors.push(`${item.id}: visible isolated source status row is missing`);
    }
  }
  const refs = [...html.matchAll(/href="([^"]+)"/g)].map((entry) => entry[1]).filter((ref) => !ref.startsWith('#'));
  if (refs.length < 2) errors.push('expected integrated and provisional dashboard links');
  for (const href of requiredRefs) if (!refs.includes(href)) errors.push(`missing required portfolio link: ${href}`);
  if (new Set(refs).size !== refs.length) errors.push('duplicate dashboard links in local entry');
  for (const href of refs) {
    if (/^[a-z]+:/i.test(href) || isAbsolute(href)) {
      errors.push(`non-local link in portfolio entry: ${href}`);
      continue;
    }
    const target = resolve(PROJECT_ROOT, href);
    if (!existsSync(target) || !statSync(target).isFile()) {
      errors.push(`missing dashboard link: ${href}`);
      continue;
    }
    const fromRoot = relative(realpathSync(PROJECT_ROOT), realpathSync(target));
    if (isAbsolute(fromRoot) || fromRoot.startsWith(`..${sep}`) || fromRoot === '..') {
      errors.push(`missing or escaping dashboard link: ${href}`);
    }
  }
  return { errors, linkCount: refs.length };
}

function worktrees() {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: BRANCH_ROOT,
    encoding: 'utf8',
  });
  const trees = [];
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) trees.push({ path: resolve(line.slice(9)), branch: null });
    else if (line.startsWith('branch refs/heads/') && trees.length) {
      trees[trees.length - 1].branch = line.slice('branch refs/heads/'.length);
    }
  }
  return trees;
}

function gitText(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).replace(/\r\n?/g, '\n').trimEnd();
}

function checkSpecIdentity(known, id, filename, title, errors, contentHash) {
  if (!title?.startsWith(`# ${id} `) && !title?.startsWith(`# ${id} —`)) {
    errors.push(`${filename}: specification heading does not match its ID`);
  }
  const existing = known.get(id);
  if (existing && (existing.filename !== filename || existing.title !== title)) {
    errors.push(`${id}: conflicting current specification identity (${existing.filename} vs ${filename})`);
  } else if (existing?.contentHash && contentHash && existing.contentHash !== contentHash) {
    errors.push(`${id}: same specification identity has divergent source bytes`);
  } else known.set(id, { filename, title, contentHash });
}

function discoverCurrentOwnerWorktrees(trees, roadmap, current, ownerByTask, projectRoot = PROJECT_ROOT) {
  const errors = [];
  const ownStates = new Set(['DRAFT', 'READY', 'ACTIVE', 'REVIEW', 'FIX', 'ACCEPTANCE', 'BLOCKED']);
  for (const tree of trees) {
    const directory = resolve(tree.path, 'tasks/active');
    if (!existsSync(directory)) continue;
    const ownedIds = new Set();
    for (const name of readdirSync(directory)) {
      const id = name.match(/^(TASK-\d{3})-.+\.md$/)?.[1];
      if (!id || ['DONE', 'DEFERRED'].includes(roadmap.get(id))) continue;
      const taskSource = loadUtf8(resolve(directory, name));
      const state = taskSource.match(/^- State:\s*(\S+)/m)?.[1];
      if (!ownStates.has(state)) continue;

      // A copied task document is not an ownership claim. The document must
      // name this exact registered worktree and its checked-out branch.
      const worktreeRef = taskSource.match(/^- Worktree:\s*`(\.worktrees\/[^`]+)`/m)?.[1];
      const declaredBranch = taskSource.match(/^- Branch:\s*`([^`]+)`/m)?.[1];
      if (worktreeRef !== `.worktrees/${basename(tree.path)}` || declaredBranch !== tree.branch
        || resolve(projectRoot, worktreeRef).toLowerCase() !== tree.path.toLowerCase()) continue;

      if (ownedIds.has(id)) errors.push(`${id}: multiple owner-worktree task files`);
      ownedIds.add(id);
      // Historical worktrees intentionally retain their original self-owned metadata.
      // Only the canonical reconciled task file designates the current control-plane
      // worktree after integration. A preserved source snapshot therefore cannot
      // compete for current control-plane ownership.
      if (!current.has(id) || ownerByTask.get(id) !== tree.path.toLowerCase()) continue;
      if (!roadmap.has(id)) errors.push(`${id}: canonical owner worktree exists but task ID is absent from portfolio`);
      else if (roadmap.get(id) !== state) errors.push(`${id}: canonical owner worktree is ${state}, roadmap is ${roadmap.get(id)}`);
    }
  }
  return errors;
}

function openTaskSourceErrors(taskId, reconciledName, reconciledSource, ownerName, ownerSource) {
  const errors = [];
  if (reconciledName !== ownerName) errors.push(`${taskId}: reconciled open task filename differs from owner worktree`);
  if (reconciledSource !== ownerSource) {
    errors.push(`${taskId}: reconciled open task metadata/body differs from owner worktree`);
  }
  return errors;
}

function taskState(source) {
  return source.match(/^- State:\s*(\S+)\s*$/m)?.[1] ?? null;
}

function sourceLifecycleFromTask(source) {
  const lines = source.split('\n');
  const first = lines.findIndex((line) => line.startsWith('## '));
  if (first < 0 || !['## Metadata', '## Lifecycle'].includes(lines[first])) return null;
  const end = lines.findIndex((line, i) => i > first && line.startsWith('## '));
  const section = lines.slice(first + 1, end < 0 ? lines.length : end);
  const stateLines = section.filter((line) => line.startsWith('- State:'));
  const lifecycleLines = section.filter((line) => /^`(PLANNED|DRAFT|READY|ACTIVE|REVIEW|FIX|ACCEPTANCE|DONE|BLOCKED|DEFERRED)(?:\s|`)/.test(line));
  if (lines[first] === '## Metadata' && stateLines.length !== 1) return null;
  if (lines[first] === '## Lifecycle' && (stateLines.length || lifecycleLines.length !== 1)) return null;
  const marker = lines[first] === '## Metadata'
    ? stateLines[0].match(/^- State:\s*(\S+)/)?.[1]
    : lifecycleLines[0].match(/^`(\w+)(?:\s|`)/)?.[1];
  return STATES.includes(marker) ? marker : null;
}

// A source task can be ACTIVE/REVIEW in its own unintegrated worktree while
// main holds a PLANNED *integration-only index*. Verify BOTH dimensions so
// main portfolio counts never silently conceal real authorized source work.
// This does not copy owner task bytes, promote main or authorize Git/SQL.
// An independent ID baseline prevents accidentally deleting both the manifest
// entry and all four Source fields from silently hiding authorized work. Any
// change to this set requires a separately reviewed integration/retirement gate.
const REQUIRED_ISOLATED_SOURCE_IDS = Object.freeze(['TASK-130', 'TASK-132', 'TASK-134']);
function verifyIsolatedSourceIndices(trees, roadmap, projectRoot = PROJECT_ROOT, branchRoot = BRANCH_ROOT,
  requiredIds = REQUIRED_ISOLATED_SOURCE_IDS) {
  const errors = [];
  const items = [];
  const byPath = new Map(trees.map((tree) => [tree.path.toLowerCase(), tree]));
  const directory = resolve(branchRoot, 'tasks/backlog');
  const manifestPath = resolve(branchRoot, 'docs/project/ISOLATED_TASK_SOURCE_INDEX.json');
  if (!existsSync(manifestPath)) {
    return { errors: ['missing required isolated source index manifest'], items, hash: '' };
  }
  let manifest;
  try {
    manifest = JSON.parse(loadUtf8(manifestPath));
  } catch {
    return { errors: ['isolated source index manifest is not valid UTF-8 JSON'], items, hash: '' };
  }
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.sources)) {
    return { errors: ['isolated source index manifest has invalid schemaVersion or sources'], items, hash: '' };
  }
  const mandatory = new Map();
  for (const source of manifest.sources) {
    if (!/^TASK-\d{3}$/.test(source?.id ?? '') || mandatory.has(source.id)) {
      errors.push('isolated source index manifest has a malformed or duplicated task ID');
      continue;
    }
    mandatory.set(source.id, source);
  }
  for (const id of requiredIds) {
    if (!mandatory.has(id)) errors.push(`${id}: required isolated source is missing from manifest`);
  }
  const inspected = new Set();
  for (const filename of readdirSync(directory)) {
    const id = filename.match(/^(TASK-\d{3})-.+\.md$/)?.[1];
    if (!id) continue;
    const indexSource = loadUtf8(resolve(directory, filename));
    const field = (name) => indexSource.match(new RegExp(`^- ${name}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
    const lifecycle = field('Source lifecycle');
    const branch = field('Source branch')?.match(/^`([^`]+)`$/)?.[1];
    const worktree = field('Source worktree')?.match(/^`([^`]+)`$/)?.[1];
    const task = field('Source task')?.match(/^`([^`]+)`/)?.[1];
    // A source pointer without a lifecycle is as unsafe as an unknown owner.
    if (![lifecycle, field('Source branch'), field('Source worktree'), field('Source task')].some(Boolean)) continue;
    inspected.add(id);
    const expected = mandatory.get(id);
    if (!expected) {
      errors.push(`${id}: unregistered isolated source index is not in required manifest`);
      continue;
    }
    if (expected.lifecycle !== lifecycle || expected.branch !== branch
      || expected.worktree !== worktree || expected.task !== task) {
      errors.push(`${id}: source integration index differs from required manifest`);
    }
    if (roadmap.get(id) !== 'PLANNED') errors.push(`${id}: source integration index must remain PLANNED until a separately approved promotion`);
    if (!['DRAFT', 'READY', 'ACTIVE', 'REVIEW', 'FIX', 'ACCEPTANCE', 'BLOCKED'].includes(lifecycle)
      || !branch || !worktree || !task) {
      errors.push(`${id}: incomplete or invalid Source lifecycle/branch/worktree/task fields`);
      continue;
    }
    if (!/^\.worktrees\/[A-Za-z0-9_-]+$/.test(worktree)
      || !new RegExp(`^tasks/active/${id}-[A-Za-z0-9_-]+\\.md$`).test(task)) {
      errors.push(`${id}: noncanonical or escaping source worktree/task path`);
      continue;
    }
    const ownerPath = resolve(projectRoot, worktree);
    const registered = byPath.get(ownerPath.toLowerCase());
    if (!registered || canonicalWorktreeRef(registered) !== worktree || registered.branch !== branch) {
      errors.push(`${id}: source worktree/branch does not match registered Git owner`);
      continue;
    }
    const ownerFilename = resolve(ownerPath, task);
    if (!existsSync(ownerFilename)) {
      errors.push(`${id}: declared source task file does not exist in owner worktree`);
      continue;
    }
    const ownerSource = loadUtf8(ownerFilename);
    const expectedHeading = indexSource.split('\n', 1)[0];
    const ownerHeading = ownerSource.split('\n', 1)[0];
    const actualLifecycle = sourceLifecycleFromTask(ownerSource);
    if (ownerHeading !== expectedHeading) errors.push(`${id}: source task title differs from main integration index`);
    if (actualLifecycle !== lifecycle) {
      errors.push(`${id}: source lifecycle drift (index=${lifecycle}, owner=${actualLifecycle ?? 'unknown'})`);
    }
    items.push({ id, lifecycle, branch, worktree, task });
  }
  for (const id of mandatory.keys()) {
    if (!inspected.has(id)) errors.push(`${id}: required isolated source index is missing from the PLANNED backlog task`);
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  const hash = createHash('sha256').update(loadUtf8(manifestPath)).update('\n')
    .update(items.map((item) => Object.values(item).join('|')).join('\n')).digest('hex');
  return { errors, items, hash };
}

function isUnmaterializedDraft(source, roadmapState) {
  return roadmapState === 'DRAFT'
    && taskState(source) === 'DRAFT'
    && /^- Worktree:\s*not created\s*$/m.test(source)
    && /^- Branch:\s*not created\s*$/m.test(source);
}

function canonicalWorktreeRef(tree) {
  return tree.path.toLowerCase() === PROJECT_ROOT.toLowerCase()
    ? '.'
    : `.worktrees/${basename(tree.path)}`;
}

function primaryTaskFiles(trees, roadmap) {
  const errors = [];
  const current = new Set();
  const currentTrees = new Map();
  const ownerByTask = new Map();
  const byPath = new Map(trees.map((tree) => [tree.path.toLowerCase(), tree]));
  const activeDirectory = resolve(BRANCH_ROOT, 'tasks/active');

  // Materialized open-task metadata names the owner worktree. This also checks
  // Class-A TASK-102, whose accepted contract currently shares the FE worktree.
  for (const [taskId, state] of roadmap) {
    if (['DONE', 'DEFERRED', 'PLANNED'].includes(state)) continue;
    const names = readdirSync(activeDirectory).filter((name) => name.startsWith(`${taskId}-`) && name.endsWith('.md'));
    if (names.length !== 1) {
      errors.push(`${taskId}: expected exactly one reconciled open task file`);
      continue;
    }
    const taskSource = loadUtf8(resolve(activeDirectory, names[0]));
    const reconciledState = taskState(taskSource);
    if (reconciledState !== state) {
      errors.push(`${taskId}: reconciled task state ${reconciledState ?? 'missing'} differs from roadmap ${state}`);
      continue;
    }
    const controlWorktreeRef = taskSource.match(/^- Control worktree:\s*`(\.|\.worktrees\/[^`]+)`/m)?.[1];
    const controlBranch = taskSource.match(/^- Control branch:\s*`([^`]+)`/m)?.[1];
    const worktreeRef = controlWorktreeRef ?? taskSource.match(/^- Worktree:\s*`(\.worktrees\/[^`]+)`/m)?.[1];
    const declaredBranch = controlBranch ?? taskSource.match(/^- Branch:\s*`([^`]+)`/m)?.[1];
    const unmaterializedDraft = isUnmaterializedDraft(taskSource, state);
    if (unmaterializedDraft) {
      current.add(taskId);
      continue;
    }
    if (!worktreeRef || !declaredBranch) {
      errors.push(`${taskId}: missing exact control/owner worktree or branch metadata`);
      continue;
    }
    const target = resolve(PROJECT_ROOT, worktreeRef);
    const ownerTree = byPath.get(target.toLowerCase());
    if (!ownerTree) {
      errors.push(`${taskId}: declared control/owner worktree is not registered: ${worktreeRef}`);
      continue;
    }
    if (worktreeRef !== canonicalWorktreeRef(ownerTree)) {
      errors.push(`${taskId}: control/owner Worktree metadata must use the canonical registered relative path`);
    }
    if (declaredBranch !== ownerTree.branch) {
      errors.push(`${taskId}: declared branch ${declaredBranch} differs from registered ${ownerTree.branch}`);
    }
    const ownerDirectory = resolve(ownerTree.path, 'tasks/active');
    const ownerNames = existsSync(ownerDirectory)
      ? readdirSync(ownerDirectory).filter((name) => name.startsWith(`${taskId}-`) && name.endsWith('.md'))
      : [];
    if (ownerNames.length !== 1) {
      errors.push(`${taskId}: owner worktree is missing a uniquely named task file`);
      continue;
    }
    const ownerSource = loadUtf8(resolve(ownerDirectory, ownerNames[0]));
    const ownerState = ownerSource.match(/^- State:\s*(\S+)/m)?.[1];
    if (ownerState !== state) errors.push(`${taskId}: owner state ${ownerState ?? 'missing'} differs from roadmap ${state}`);
    errors.push(...openTaskSourceErrors(taskId, names[0], taskSource, ownerNames[0], ownerSource));
    current.add(taskId);
    currentTrees.set(ownerTree.path.toLowerCase(), ownerTree);
    ownerByTask.set(taskId, ownerTree.path.toLowerCase());
  }

  errors.push(...discoverCurrentOwnerWorktrees(trees, roadmap, current, ownerByTask));

  const specIdentities = new Map();
  const mainTree = trees.find((tree) => tree.branch === 'main');
  if (!mainTree) errors.push('missing registered integrated main worktree');
  const specSources = [...new Map([mainTree, ...currentTrees.values()]
    .filter(Boolean).map((tree) => [tree.path.toLowerCase(), tree])).values()];
  for (const tree of specSources) {
    const specsDirectory = resolve(tree.path, 'docs/specs');
    if (!existsSync(specsDirectory)) continue;
    for (const specName of readdirSync(specsDirectory)) {
      const match = specName.match(/^(SPEC-\d{3})-.+\.md$/);
      if (!match) continue;
      const content = loadUtf8(resolve(specsDirectory, specName));
      const title = content.split('\n').find((line) => line.startsWith('# '))?.trim();
      const hash = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
      checkSpecIdentity(specIdentities, match[1], specName, title, errors, hash);
    }
  }
  return { errors, current: [...current], currentOwnerWorktrees: currentTrees.size, mainTree };
}

function landingContext(source, counts, trees, active, isolatedSources) {
  if (!active.mainTree) throw new Error('Cannot build local landing without a registered main worktree');
  const mainDashboard = resolve(active.mainTree.path, 'docs/project/PROJECT_ROADMAP.html');
  const provisionalDashboard = resolve(BRANCH_ROOT, 'docs/project/PROJECT_ROADMAP.html');
  const mainHead = gitText(active.mainTree.path, ['rev-parse', 'HEAD']);
  const branch = gitText(BRANCH_ROOT, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const hash = createHash('sha256').update(Buffer.from(source, 'utf8')).digest('hex');
  return {
    counts,
    hash,
    mainHead,
    branch,
    mainDashboard,
    provisionalDashboard,
    requiredRefs: [localHref(INTEGRATED_SNAPSHOT), localHref(provisionalDashboard)],
    isolatedSources,
  };
}

function renderLanding(context) {
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
  const metric = (key, label) => `<div class="metric" data-portfolio="${key}"><b>${context.counts[key]}</b><span>${label}</span></div>`;
  const isolatedSources = context.isolatedSources ?? { items: [], hash: createHash('sha256').update('').digest('hex') };
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="pokenexus-portfolio-source-sha256" content="${context.hash}">
<title>Skadyn Idle — Local Portfolio</title><style>
body{margin:0;background:#0b1017;color:#e9f0f7;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}.wrap{max-width:1050px;margin:auto;padding:28px}.panel{background:#121923;border:1px solid #26364a;border-radius:12px;padding:18px;margin:14px 0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{background:#182230;border:1px solid #26364a;border-radius:9px;padding:14px}.metric b{display:block;font-size:24px}.metric span,.muted{color:#93a4b7}.views{display:grid;grid-template-columns:1fr 1fr;gap:12px}.view{display:block;color:#e9f0f7;text-decoration:none;background:#182230;border:1px solid #26364a;border-radius:10px;padding:16px}.view strong{color:#62d3ff}code{color:#ffd166}@media(max-width:700px){.metrics,.views{grid-template-columns:1fr 1fr}} </style></head><body><div class="wrap">
  <h1>Skadyn Idle — Project Control</h1><p class="muted">Entrada local multi-worktree. Não altera autoridade, task state ou Git history.</p>
  <section class="metrics">${metric('total','Tasks no main')}${metric('done','DONE no main')}${metric('active','ACTIVE no main')}${metric('acceptance','ACCEPTANCE no main')}</section>
  <section class="panel" data-source-index-count="${isolatedSources.items.length}" data-source-index-sha256="${isolatedSources.hash}"><h2>Trabalho técnico isolado, ainda não integrado</h2><p class="muted">Essas tasks são PLANNED apenas quanto à integração no main. Seus estados reais de source são verificados nos worktrees Git registrados; não são novas tasks, aceites, migrações ou autorização de release.</p>${isolatedSources.items.map((item) => `<p><code>${esc(item.id)}</code> — source <b>${esc(item.lifecycle)}</b> em <code>${esc(item.worktree)}</code>; integração no main bloqueada.</p>`).join('')}<p class="muted">SHA-256 do manifesto e metadados de identidade/lifecycle: <code>${esc(isolatedSources.hash)}</code></p></section>
<section class="panel"><h2>Dashboards</h2><div class="views">
<a class="view" href="${esc(context.requiredRefs[0])}"><strong>Integrated main</strong><br><span class="muted">Snapshot exato do commit <code>${esc(context.mainHead.slice(0,12))}</code>.</span></a>
<a class="view" href="${esc(context.requiredRefs[1])}"><strong>Provisional working tree</strong><br><span class="muted">Branch <code>${esc(context.branch)}</code>; pode conter alterações locais ainda não integradas.</span></a>
</div></section>
<section class="panel"><b>Source SHA-256</b><br><code>${context.hash}</code><p class="muted">O Markdown do worktree de reconciliação continua sendo a fonte canônica da visão provisória.</p></section>
</div></body></html>\n`;
}

function writeIntegratedSnapshot(active) {
  if (!active.mainTree) throw new Error('Missing registered main worktree');
  mkdirSync(LOCAL_SNAPSHOT_DIR, { recursive: true });
  const html = execFileSync('git', ['show', 'HEAD:docs/project/PROJECT_ROADMAP.html'], {
    cwd: active.mainTree.path,
    encoding: 'utf8',
  }).replace(/\r\n?/g, '\n');
  writeFileSync(INTEGRATED_SNAPSHOT, html, 'utf8');
  return html;
}

function portfolioContext() {
  const source = loadUtf8(ROADMAP_MD);
  const { counts, taskStatus } = readPortfolio(source);
  const trees = worktrees();
  const active = primaryTaskFiles(trees, taskStatus);
  const isolatedSources = verifyIsolatedSourceIndices(trees, taskStatus);
  return { source, counts, taskStatus, trees, active, isolatedSources,
    landing: landingContext(source, counts, trees, active, isolatedSources) };
}

function generateLocalLanding() {
  const context = portfolioContext();
  const errors = [...context.active.errors, ...context.isolatedSources.errors];
  if (errors.length) throw new Error(`Local portfolio ownership validation failed:\n- ${errors.join('\n- ')}`);
  writeIntegratedSnapshot(context.active);
  writeFileSync(LOCAL_ENTRY, renderLanding(context.landing), 'utf8');
  console.log(`Generated local portfolio landing for main ${context.landing.mainHead.slice(0, 12)} and provisional ${context.landing.branch}`);
}

function main() {
  const context = portfolioContext();
  const entry = readLanding(loadUtf8(LOCAL_ENTRY), context.counts, context.landing.hash,
    context.landing.requiredRefs, context.isolatedSources);
  const errors = [...entry.errors, ...context.active.errors, ...context.isolatedSources.errors];
  if (!existsSync(INTEGRATED_SNAPSHOT)) errors.push('missing generated integrated-main dashboard snapshot');
  else {
    const expectedIntegrated = execFileSync('git', ['show', 'HEAD:docs/project/PROJECT_ROADMAP.html'], {
      cwd: context.active.mainTree.path,
      encoding: 'utf8',
    }).replace(/\r\n?/g, '\n');
    if (loadUtf8(INTEGRATED_SNAPSHOT) !== expectedIntegrated) errors.push('integrated-main dashboard snapshot is stale');
  }
  if (errors.length) throw new Error(`Local portfolio validation failed:\n- ${errors.join('\n- ')}`);
  const isolatedByState = Object.entries(Object.groupBy(context.isolatedSources.items, (item) => item.lifecycle))
    .map(([state, items]) => `${state}=${items.length}`).join(', ');
  console.log(`Local portfolio check passed: ${context.counts.total} tasks, ${context.trees.length} worktrees, ${context.active.current.length} open task files in ${context.active.currentOwnerWorktrees} control worktrees, ${context.isolatedSources.items.length} isolated source tasks (${isolatedByState}), ${entry.linkCount} links, SHA-256 ${context.landing.hash}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'generate') generateLocalLanding();
    else main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { checkSpecIdentity, discoverCurrentOwnerWorktrees, isUnmaterializedDraft, openTaskSourceErrors, readLanding, readPortfolio, renderLanding, verifyIsolatedSourceIndices };
