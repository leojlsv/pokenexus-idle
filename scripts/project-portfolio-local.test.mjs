import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import {
  checkSpecIdentity,
  discoverCurrentOwnerWorktrees,
  openTaskSourceErrors,
  readLanding,
  readPortfolio,
} from './project-portfolio-local.mjs';

const statuses = ['PLANNED', 'DRAFT', 'READY', 'ACTIVE', 'REVIEW', 'FIX', 'ACCEPTANCE', 'DONE', 'BLOCKED', 'DEFERRED'];

function fixture(ids) {
  const lines = [
    `- Planned task IDs in this roadmap: \`TASK-000\` through \`TASK-001\`.`,
    ...statuses.map((status) => `- ${status}: ${status === 'DONE' ? 1 : status === 'ACTIVE' ? 1 : 0}.`),
    '| Task | Class | State | Owner |',
    ...ids.map(([id, state]) => `| \`${id}\` Example task | B | ${state} | PM → ChatGPT |`),
  ];
  return lines.join('\n');
}

test('portfolio checks exact contiguous task IDs, not only matching total rows', () => {
  const valid = readPortfolio(fixture([['TASK-000', 'DONE'], ['TASK-001', 'ACTIVE']]));
  assert.equal(valid.counts.total, 2);
  assert.equal(valid.taskStatus.get('TASK-001'), 'ACTIVE');
  assert.throws(() => readPortfolio(fixture([['TASK-000', 'DONE'], ['TASK-002', 'ACTIVE']])), /Missing contiguous roadmap identity TASK-001/);
});

test('local entry fails closed for stale source hash, counters or missing links', () => {
  const result = readLanding('<meta name="pokenexus-portfolio-source-sha256" content="wrong"><div data-portfolio="total"><b>3</b><a href="does-not-exist.html">Not found</a>', {
    total: 2, done: 1, active: 1, acceptance: 0,
  }, 'expected-hash');
  assert.match(result.errors.join('\n'), /current reconciled Markdown SHA-256/);
  assert.match(result.errors.join('\n'), /metric total/);
  assert.match(result.errors.join('\n'), /missing dashboard link/);
});

test('current spec IDs cannot resolve to competing filenames or headings', () => {
  const found = new Map();
  const errors = [];
  checkSpecIdentity(found, 'SPEC-018', 'SPEC-018-catalog.md', '# SPEC-018 — Published catalog', errors);
  checkSpecIdentity(found, 'SPEC-018', 'SPEC-018-catalog.md', '# SPEC-018 — Published catalog', errors);
  assert.deepEqual(errors, []);
  checkSpecIdentity(found, 'SPEC-018', 'SPEC-018-history.md', '# SPEC-018 — Historical authority', errors);
  assert.match(errors.join('\n'), /conflicting current specification identity/);
  errors.length = 0;
  checkSpecIdentity(found, 'SPEC-019', 'SPEC-019-frontier.md', '# SPEC-018 — Wrong number', errors);
  assert.match(errors.join('\n'), /heading does not match its ID/);
});

test('identical current specification identities cannot silently diverge in content', () => {
  const known = new Map();
  const errors = [];
  checkSpecIdentity(known, 'SPEC-017', 'SPEC-017-presentation.md', '# SPEC-017 — Presentation', errors, 'hash-a');
  checkSpecIdentity(known, 'SPEC-017', 'SPEC-017-presentation.md', '# SPEC-017 — Presentation', errors, 'hash-b');
  assert.match(errors.join('\n'), /divergent source bytes/);
});

test('a local landing must keep distinct integrated and reconciliation destinations', () => {
  const result = readLanding('<meta name="pokenexus-portfolio-source-sha256" content="hash"><div data-portfolio="total"><b>2</b><div data-portfolio="done"><b>1</b><div data-portfolio="active"><b>1</b><div data-portfolio="acceptance"><b>0</b><a href="not-here.html">missing</a><a href="not-here.html">duplicate</a>', {
    total: 2, done: 1, active: 1, acceptance: 0,
  }, 'hash');
  assert.match(result.errors.join('\n'), /missing required portfolio link/);
  assert.match(result.errors.join('\n'), /duplicate dashboard links/);
  assert.match(result.errors.join('\n'), /TASK-100-collection-pokemon-team-ui/);
});

function ownedWorktreeFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pokenexus-portfolio-owner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const createTree = (name) => {
    const tree = { path: join(root, '.worktrees', name), branch: `feat/${name}` };
    mkdirSync(join(tree.path, 'tasks/active'), { recursive: true });
    return tree;
  };
  const writeTask = (tree, id, state, declaredOwner = tree) => {
    writeFileSync(join(tree.path, 'tasks/active', `${id}-fixture.md`), [
      `# ${id} — Test fixture`,
      '## Metadata',
      `- State: ${state}`,
      `- Worktree: \`.worktrees/${basename(declaredOwner.path)}\``,
      `- Branch: \`${declaredOwner.branch}\``,
      '',
    ].join('\n'));
  };
  return { root, createTree, writeTask };
}

test('nonstandard named current worktrees are discovered by self-owned metadata in ACTIVE, REVIEW and FIX', (t) => {
  const { root, createTree, writeTask } = ownedWorktreeFixture(t);
  for (const state of ['ACTIVE', 'REVIEW', 'FIX']) {
    const tree = createTree(`nonstandard-${state.toLowerCase()}`);
    writeTask(tree, 'TASK-105', state);
    assert.deepEqual(discoverCurrentOwnerWorktrees(
      [tree], new Map([['TASK-105', state]]), new Set(['TASK-105']),
      new Map([['TASK-105', tree.path.toLowerCase()]]), root,
    ), []);
  }
});

test('a newly active owner with nonstandard worktree basename cannot evade the reconciled portfolio', (t) => {
  const { root, createTree, writeTask } = ownedWorktreeFixture(t);
  const tree = createTree('unexpected-feature-lane');
  writeTask(tree, 'TASK-105', 'ACTIVE');
  const errors = discoverCurrentOwnerWorktrees([tree], new Map([['TASK-105', 'PLANNED']]),
    new Set(), new Map(), root).join('\n');
  assert.match(errors, /TASK-105: owner worktree is ACTIVE, roadmap is PLANNED/);
  assert.match(errors, /TASK-105: current owner worktree is not registered by an open reconciled task/);
});

test('two self-declared ACTIVE owner worktrees for the same ID are rejected', (t) => {
  const { root, createTree, writeTask } = ownedWorktreeFixture(t);
  const first = createTree('original-owner');
  const second = createTree('competing-owner');
  writeTask(first, 'TASK-105', 'ACTIVE');
  writeTask(second, 'TASK-105', 'ACTIVE');
  const errors = discoverCurrentOwnerWorktrees(
    [first, second], new Map([['TASK-105', 'ACTIVE']]), new Set(['TASK-105']),
    new Map([['TASK-105', first.path.toLowerCase()]]), root,
  ).join('\n');
  assert.match(errors, /TASK-105: competing current task owner worktrees/);
  assert.match(errors, /competing-owner/);
});

test('archived acceptance, deferred records and mirrored open task documents do not claim ownership', (t) => {
  const { root, createTree, writeTask } = ownedWorktreeFixture(t);
  const owner = createTree('current-owner');
  const mirror = createTree('read-only-mirror');
  const archived = createTree('archived-acceptance');
  const retired = createTree('abandoned-experiment');
  writeTask(owner, 'TASK-105', 'ACTIVE');
  writeTask(mirror, 'TASK-105', 'ACTIVE', owner);
  writeTask(archived, 'TASK-009', 'ACCEPTANCE');
  writeTask(retired, 'TASK-099', 'READY');
  assert.deepEqual(discoverCurrentOwnerWorktrees(
    [owner, mirror, archived, retired],
    new Map([['TASK-105', 'ACTIVE'], ['TASK-009', 'DONE'], ['TASK-099', 'DEFERRED']]),
    new Set(['TASK-105']), new Map([['TASK-105', owner.path.toLowerCase()]]), root,
  ), []);
});

test('matching task State is insufficient when reconciled owner/reviewer or acceptance text drifts', () => {
  const original = '- State: ACTIVE\n- Owner: Lead Developer\n- Reviewer: QA Reviewer\n- Gate: pending\n';
  assert.deepEqual(openTaskSourceErrors('TASK-105', 'TASK-105-fixture.md', original,
    'TASK-105-fixture.md', original), []);
  const stale = original.replace('QA Reviewer', 'N/A').replace('Gate: pending', 'Gate: accepted');
  assert.match(openTaskSourceErrors('TASK-105', 'TASK-105-fixture.md', stale,
    'TASK-105-fixture.md', original).join('\n'), /metadata\/body differs from owner worktree/);
  assert.match(openTaskSourceErrors('TASK-105', 'TASK-105-renamed.md', original,
    'TASK-105-fixture.md', original).join('\n'), /filename differs from owner worktree/);
});
