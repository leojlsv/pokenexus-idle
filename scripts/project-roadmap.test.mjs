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
  for (const directory of ['scripts', 'docs/project', 'tasks/active', 'tasks/done']) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  copyFileSync(join(SOURCE_ROOT, 'scripts/project-roadmap.mjs'), join(root, 'scripts/project-roadmap.mjs'));
  const source = readFileSync(join(SOURCE_ROOT, 'docs/project/PROJECT_ROADMAP.md'), 'utf8');
  writeFileSync(join(root, 'docs/project/PROJECT_ROADMAP.md'), source);
  const knownIds = new Set([...source.matchAll(/^\| `(TASK-\d{3})`/gm)].map((match) => match[1]));
  for (const state of ['active', 'done']) {
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
