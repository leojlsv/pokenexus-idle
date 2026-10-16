import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoots = [];

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runRoadmap(root, command) {
  return spawnSync(process.execPath, [join(root, 'scripts/project-roadmap.mjs'), command], {
    cwd: root,
    encoding: 'utf8',
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pokenexus-roadmap-validator-'));
  temporaryRoots.push(root);
  for (const directory of ['scripts', 'docs/project', 'tasks/backlog', 'tasks/active', 'tasks/done']) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  copyFileSync(join(SOURCE_ROOT, 'scripts/project-roadmap.mjs'), join(root, 'scripts/project-roadmap.mjs'));
  const source = readFileSync(join(SOURCE_ROOT, 'docs/project/PROJECT_ROADMAP.md'), 'utf8');
  writeFileSync(join(root, 'docs/project/PROJECT_ROADMAP.md'), source);
  const knownIds = new Set([...source.matchAll(/^\| `(TASK-\d{3})`/gm)].map((match) => match[1]));
  for (const state of ['backlog', 'active', 'done']) {
    for (const filename of readdirSync(join(SOURCE_ROOT, `tasks/${state}`))) {
      const taskId = filename.match(/^(TASK-\d{3})-.+\.md$/)?.[1];
      if (taskId && knownIds.has(taskId)) {
        copyFileSync(join(SOURCE_ROOT, `tasks/${state}`, filename), join(root, `tasks/${state}`, filename));
      }
    }
  }
  return root;
}

function promoteDeferredFixtureToReady(root) {
  const roadmap = join(root, 'docs/project/PROJECT_ROADMAP.md');
  let source = readFileSync(roadmap, 'utf8');
  assert.match(source, /^\| `TASK-099`[^|\n]*\| C \| DEFERRED \|/m);
  source = source.replace(/^(\| `TASK-099`[^|\n]*\| C \| )DEFERRED(?= \|)/m, '$1READY');
  source = source.replace(/^(- READY: )(\d+)(\.)$/m, (_, prefix, count, suffix) =>
    `${prefix}${Number(count) + 1}${suffix}`);
  source = source.replace(/^(- DEFERRED: )(\d+)(\.)$/m, (_, prefix, count, suffix) =>
    `${prefix}${Number(count) - 1}${suffix}`);
  writeFileSync(roadmap, source);

  const task = join(root, 'tasks/active/TASK-099-pokemon-sprite-generation-lab.md');
  writeFileSync(task, readFileSync(task, 'utf8').replace(/^- State: DEFERRED$/m, '- State: READY'));
  const generated = runRoadmap(root, 'generate');
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  return task;
}

function rejectFixture(root, expected) {
  const result = runRoadmap(root, 'check');
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, expected);
}

test('an existing historical DONE/DEFERRED roadmap remains valid', () => {
  const root = fixture();
  const generated = runRoadmap(root, 'generate');
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const html = readFileSync(join(root, 'docs/project/PROJECT_ROADMAP.html'), 'utf8');
  assert.match(html, /Pre-alpha Local Test Milestones/);
  assert.match(html, /Project Control boundaries/);
  assert.match(html, /Current Position/);
  const checked = runRoadmap(root, 'check');
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});

test('a complete Class C READY task is accepted without reopening DONE tasks', () => {
  const root = fixture();
  promoteDeferredFixtureToReady(root);
  const checked = runRoadmap(root, 'check');
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});

test('READY tasks require the review execution surface', () => {
  const root = fixture();
  const task = promoteDeferredFixtureToReady(root);
  writeFileSync(task, readFileSync(task, 'utf8').replace(/^- Reviewer execution surface: .+\n/m, ''));
  rejectFixture(root, /TASK-099: READY task is missing Reviewer execution surface/);
});

test('READY task Class must agree with its roadmap row', () => {
  const root = fixture();
  const task = promoteDeferredFixtureToReady(root);
  writeFileSync(task, readFileSync(task, 'utf8').replace(/^- Class: C$/m, '- Class: B'));
  rejectFixture(root, /TASK-099: READY Class metadata differs from roadmap C/);
});

test('N/A reviewer cannot name an active execution surface', () => {
  const root = fixture();
  const task = promoteDeferredFixtureToReady(root);
  writeFileSync(task, readFileSync(task, 'utf8').replace(
    '- Reviewer execution surface: N/A', '- Reviewer execution surface: DEFAULT'));
  rejectFixture(root, /TASK-099: Reviewer N\/A must match its execution surface/);
});

test('Class B READY tasks require an independent reviewer', () => {
  const root = fixture();
  const task = promoteDeferredFixtureToReady(root);
  const roadmap = join(root, 'docs/project/PROJECT_ROADMAP.md');
  writeFileSync(roadmap, readFileSync(roadmap, 'utf8').replace(
    /^(\| `TASK-099`[^|\n]*\| )C(?= \| READY \|)/m, '$1B'));
  writeFileSync(task, readFileSync(task, 'utf8').replace(/^- Class: C$/m, '- Class: B'));
  rejectFixture(root, /TASK-099: Class B READY task requires an independent reviewer/);
});

test('two materialized task files cannot silently override the same task ID', () => {
  const root = fixture();
  copyFileSync(join(root, 'tasks/active/TASK-099-pokemon-sprite-generation-lab.md'),
    join(root, 'tasks/active/TASK-099-duplicate.md'));
  rejectFixture(root, /duplicate materialized files for TASK-099/);
});

test('a backlog task cannot reuse the same ID with a different meaning', () => {
  const root = fixture();
  const source = join(root, 'tasks/backlog/TASK-130-historical-manual-capture-compatibility-implementation.md');
  writeFileSync(source, readFileSync(source, 'utf8').replace(
    '# TASK-130 — Historical Manual-Capture Compatibility Implementation',
    '# TASK-130 — Closed Alpha Roadmap Reconciliation'));
  rejectFixture(root, /TASK-130: task heading\/meaning mismatch/);
});

test('backlog task cannot silently declare ACTIVE while roadmap says PLANNED', () => {
  const root = fixture();
  const source = join(root, 'tasks/backlog/TASK-135-closed-alpha-phase-01-execution.md');
  writeFileSync(source, readFileSync(source, 'utf8').replace('- State: PLANNED', '- State: ACTIVE'));
  rejectFixture(root, /TASK-135: backlog source declares ACTIVE, expected PLANNED/);
});

test('backlog ignores historical-only state and fails malformed or conflicting initial markers', () => {
  const root = fixture();
  const source = join(root, 'tasks/backlog/TASK-131-economic-provenance-ledger.md');
  const original = readFileSync(source, 'utf8');
  writeFileSync(source, original.replace('`PLANNED`', '`ACTIVE — malformed`'));
  rejectFixture(root, /single unambiguous state at the start of its initial Lifecycle section/);
  writeFileSync(source, original.replace('`PLANNED`', '`PLANNED`\n- State: ACTIVE — misleading earlier marker'));
  rejectFixture(root, /single unambiguous state at the start of its initial Lifecycle section/);
  writeFileSync(source, original.replace('## Lifecycle', '## Historical Decision'));
  rejectFixture(root, /must declare backlog lifecycle in its first Metadata\/Lifecycle section/);
  writeFileSync(source, original.replace('## Lifecycle', '- State: ACTIVE — misleading prefix\n## Lifecycle'));
  rejectFixture(root, /conflicting or repeated backlog lifecycle declarations/);
  writeFileSync(source, original.replace('## Objective', '## Lifecycle\n`ACTIVE`\n\n## Objective'));
  rejectFixture(root, /conflicting or repeated backlog lifecycle declarations/);
});

test('active and done task files cannot use the same ID', () => {
  const root = fixture();
  copyFileSync(join(root, 'tasks/done/TASK-121-historical-manual-capture-compatibility-plan.md'),
    join(root, 'tasks/active/TASK-121-duplicate.md'));
  rejectFixture(root, /TASK-121: duplicate current task identity across active and done directories/);
});

test('an active REVIEW task cannot reuse an ID while changing its meaning', () => {
  const root = fixture();
  const task = join(root, 'tasks/active/TASK-141-closed-alpha-roadmap-reconciliation.md');
  writeFileSync(task, readFileSync(task, 'utf8').replace(
    '# TASK-141 — Closed Alpha Roadmap Reconciliation', '# TASK-141 — Unrelated Gameplay Implementation'));
  rejectFixture(root, /TASK-141: task heading\/meaning mismatch/);
});

test('a DONE task cannot reuse an ID while changing its meaning', () => {
  const root = fixture();
  const task = join(root, 'tasks/done/TASK-120-durable-hunt-terminal-offline-summary-contract.md');
  writeFileSync(task, readFileSync(task, 'utf8').replace(
    '# TASK-120 — Durable Hunt Terminal & Offline Summary Contract', '# TASK-120 — Unrelated Gameplay Implementation'));
  rejectFixture(root, /TASK-120: task heading\/meaning mismatch/);
});

test('historical DONE heading aliases must not authorize a renamed roadmap meaning', () => {
  const root = fixture();
  const path = join(root, 'docs/project/PROJECT_ROADMAP.md');
  const source = readFileSync(path, 'utf8');
  const oldRow = '| `TASK-028` Combat Event Presentation Contract | B | DONE |';
  assert.ok(source.includes(oldRow));
  writeFileSync(path, source.replace(oldRow, '| `TASK-028` Unrelated Technical Ownership | B | DONE |'));
  rejectFixture(root, /TASK-028: task heading\/meaning mismatch/);
});

test('a new DONE file with no roadmap row cannot bypass the current-task registry', () => {
  const root = fixture();
  writeFileSync(join(root, 'tasks/done/TASK-999-unapproved.md'),
    '# TASK-999 — Unapproved task\n## Metadata\n- State: DONE\n');
  rejectFixture(root, /TASK-999: done task file exists but roadmap row is missing/);
});

test('documentary TASK-141 roadmap cannot silently add blocked technical work as a hard dependency', () => {
  const root = fixture();
  const task = join(root, 'docs/project/PROJECT_ROADMAP.md');
  let source = readFileSync(task, 'utf8');
  const target = source.split('\n').find((line) => line.startsWith('| `TASK-141` '));
  assert.ok(target);
  source = source.replace(target, target.replace(' | TASK-129 | ', ' | TASK-129/130/134 | '));
  writeFileSync(task, source);
  rejectFixture(root, /TASK-141: blocking dependency mismatch: roadmap=TASK-129,TASK-130,TASK-134 task=TASK-129/);
});

test('planned TASK-135 cannot remove mandatory Alpha Entry TASK-136 from blocking dependencies', () => {
  const root = fixture();
  const task = join(root, 'tasks/backlog/TASK-135-closed-alpha-phase-01-execution.md');
  const original = readFileSync(task, 'utf8');
  assert.match(original, /^- TASK-136 —/m);
  writeFileSync(task, original.replace(/^- TASK-136 —.*\n/m, ''));
  rejectFixture(root, /TASK-135: blocking dependency mismatch: roadmap=TASK-133,TASK-136,TASK-142 task=TASK-133,TASK-142/);
});
