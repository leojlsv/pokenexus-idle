import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import {
  checkSpecIdentity,
  discoverCurrentOwnerWorktrees,
  isUnmaterializedDraft,
  openTaskSourceErrors,
  readLanding,
  readPortfolio,
  renderLanding,
  verifyIsolatedSourceIndices,
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
  }, 'expected-hash', ['integrated.html', 'provisional.html']);
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
  }, 'hash', ['integrated.html', 'provisional.html']);
  assert.match(result.errors.join('\n'), /missing required portfolio link/);
  assert.match(result.errors.join('\n'), /duplicate dashboard links/);
  assert.match(result.errors.join('\n'), /integrated\.html/);
});

test('generated landing identifies integrated and provisional views without redirects', () => {
  const html = renderLanding({
    counts: { total: 2, done: 1, active: 1, acceptance: 0 },
    hash: 'hash', mainHead: '0123456789abcdef', branch: 'main',
    requiredRefs: ['.maintenance/portfolio/integrated.html', '.worktrees/current/docs/project/PROJECT_ROADMAP.html'],
  });
  assert.match(html, /Integrated main/);
  assert.match(html, /Provisional working tree/);
  assert.doesNotMatch(html, /location\.replace/);
});

test('only an exact DRAFT task file may remain unmaterialized', () => {
  const draft = '- State: DRAFT\n- Branch: not created\n- Worktree: not created\n';
  assert.equal(isUnmaterializedDraft(draft, 'DRAFT'), true);
  const ready = draft.replace('- State: DRAFT', '- State: READY');
  assert.equal(isUnmaterializedDraft(ready, 'DRAFT'), false);
  const active = draft.replace('- State: DRAFT', '- State: ACTIVE');
  assert.equal(isUnmaterializedDraft(active, 'DRAFT'), false);
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

test('historical self-owned worktrees do not override the canonical reconciled owner', (t) => {
  const { root, createTree, writeTask } = ownedWorktreeFixture(t);
  const tree = createTree('unexpected-feature-lane');
  writeTask(tree, 'TASK-105', 'ACTIVE');
  assert.deepEqual(discoverCurrentOwnerWorktrees([tree], new Map([['TASK-105', 'PLANNED']]),
    new Set(), new Map(), root), []);
});

test('only the canonical declared owner is checked when historical worktrees retain old ownership metadata', (t) => {
  const { root, createTree, writeTask } = ownedWorktreeFixture(t);
  const first = createTree('original-owner');
  const second = createTree('competing-owner');
  writeTask(first, 'TASK-105', 'ACTIVE');
  writeTask(second, 'TASK-105', 'ACTIVE');
  const errors = discoverCurrentOwnerWorktrees(
    [first, second], new Map([['TASK-105', 'ACTIVE']]), new Set(['TASK-105']),
    new Map([['TASK-105', first.path.toLowerCase()]]), root,
  );
  assert.deepEqual(errors, []);
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

test('isolated source index verifies registered branch, source title and lifecycle without promoting main', (t) => {
  const { root, createTree } = ownedWorktreeFixture(t);
  const tree = createTree('task130-owner');
  const backlog = join(root, 'tasks/backlog');
  mkdirSync(backlog, { recursive: true });
  const index = join(backlog, 'TASK-130-historical.md');
  const sourceTask = join(tree.path, 'tasks/active/TASK-130-historical.md');
  const original = [
    '# TASK-130 — Historical Manual-Capture Compatibility Implementation',
    '## Metadata',
    '- State: PLANNED',
    '- Source lifecycle: REVIEW',
    `- Source branch: \`${tree.branch}\``,
    '- Source worktree: `.worktrees/task130-owner`',
    '- Source task: `tasks/active/TASK-130-historical.md`',
    '',
  ].join('\n');
  mkdirSync(join(root, 'docs/project'), { recursive: true });
  writeFileSync(join(root, 'docs/project/ISOLATED_TASK_SOURCE_INDEX.json'), JSON.stringify({
    schemaVersion: 1, sources: [{ id: 'TASK-130', lifecycle: 'REVIEW', branch: tree.branch,
      worktree: '.worktrees/task130-owner', task: 'tasks/active/TASK-130-historical.md' }],
  }));
  const source = original.replace('- State: PLANNED', '- State: REVIEW');
  writeFileSync(index, original);
  writeFileSync(sourceTask, source);
  const status = new Map([['TASK-130', 'PLANNED']]);
  const verify = () => verifyIsolatedSourceIndices([tree], status, root, root, ['TASK-130']);
  const valid = verify();
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.items[0].lifecycle, 'REVIEW');
  writeFileSync(sourceTask, source.replace('- State: REVIEW', '- State: ACTIVE'));
  assert.match(verify().errors.join('\n'), /source lifecycle drift \(index=REVIEW, owner=ACTIVE\)/);
  writeFileSync(sourceTask, source.replace('- State: REVIEW', '- State: REVIEW\n- State: ACTIVE'));
  assert.match(verify().errors.join('\n'), /source lifecycle drift \(index=REVIEW, owner=unknown\)/);
  writeFileSync(sourceTask, source.replace('Historical Manual-Capture Compatibility Implementation', 'Different ownership'));
  assert.match(verify().errors.join('\n'), /source task title differs from main integration index/);
  writeFileSync(sourceTask, source);
  writeFileSync(index, original.replace(tree.branch, 'feat/other-branch'));
  assert.match(verify().errors.join('\n'), /source worktree\/branch does not match registered Git owner/);
  writeFileSync(index, original.replace('tasks/active/TASK-130-historical.md', 'tasks/active/../secrets.toml'));
  assert.match(verify().errors.join('\n'), /noncanonical or escaping source worktree\/task path/);
  // Removing all four fields or the task index must never make its active
  // source invisible to portfolio checks with a newly consistent dashboard.
  writeFileSync(index, original.replace(/^- Source (lifecycle|branch|worktree|task):.*\n/gm, ''));
  assert.match(verify().errors.join('\n'), /TASK-130: required isolated source index is missing/);
  rmSync(index);
  assert.match(verify().errors.join('\n'), /TASK-130: required isolated source index is missing/);
  writeFileSync(index, original);
  writeFileSync(join(root, 'docs/project/ISOLATED_TASK_SOURCE_INDEX.json'), JSON.stringify({schemaVersion: 1, sources: []}));
  assert.match(verify().errors.join('\n'), /TASK-130: required isolated source is missing from manifest/);
  rmSync(join(root, 'docs/project/ISOLATED_TASK_SOURCE_INDEX.json'));
  assert.match(verify().errors.join('\n'), /missing required isolated source index manifest/);
});

test('an incomplete isolated source index cannot silently suppress source lifecycle checks', (t) => {
  const { root, createTree } = ownedWorktreeFixture(t);
  const tree = createTree('task134-owner');
  const backlog = join(root, 'tasks/backlog');
  mkdirSync(backlog, { recursive: true });
  mkdirSync(join(root, 'docs/project'), { recursive: true });
  writeFileSync(join(root, 'docs/project/ISOLATED_TASK_SOURCE_INDEX.json'), JSON.stringify({
    schemaVersion: 1, sources: [{ id: 'TASK-134', lifecycle: 'ACTIVE', branch: tree.branch,
      worktree: '.worktrees/task134-owner', task: 'tasks/active/TASK-134-fixture.md' }],
  }));
  writeFileSync(join(backlog, 'TASK-134-fixture.md'), [
    '# TASK-134 — Durable Hunt Terminal & Offline Summary Implementation',
    '## Metadata',
    '- State: PLANNED',
    '- Source lifecycle: ACTIVE',
    `- Source branch: \`${tree.branch}\``,
    '- Source worktree: `.worktrees/task134-owner`',
    // Missing Source task must fail without inferring one by ID.
    '',
  ].join('\n'));
  const result = verifyIsolatedSourceIndices([tree], new Map([['TASK-134', 'PLANNED']]), root, root, ['TASK-134']);
  assert.match(result.errors.join('\n'), /incomplete or invalid Source lifecycle\/branch\/worktree\/task/);
});

test('source lifecycle signature must be represented in generated landing', () => {
  const html = '<meta name="pokenexus-portfolio-source-sha256" content="hash"><div data-portfolio="total"><b>2</b><div data-portfolio="done"><b>1</b><div data-portfolio="active"><b>1</b><div data-portfolio="acceptance"><b>0</b><a href="not-here.html">Missing</a>';
  const context = { items: [{ id: 'TASK-130', lifecycle: 'REVIEW' }], hash: 'verified-source-hash' };
  const result = readLanding(html, { total: 2, done: 1, active: 1, acceptance: 0 }, 'hash', [], context);
  assert.match(result.errors.join('\n'), /isolated source task count/);
  assert.match(result.errors.join('\n'), /isolated source lifecycle\/owner identity signature is stale/);
});

test('landing rejects missing visible source rows even if count and hash attributes still match', () => {
  const sourceIndices = {
    items: [{ id: 'TASK-130', lifecycle: 'REVIEW', worktree: '.worktrees/TASK-130-owner' }],
    hash: 'source-integrity-hash',
  };
  const original = renderLanding({
    counts: { total: 2, done: 1, active: 1, acceptance: 0 }, hash: 'roadmap-hash',
    mainHead: '0123456789abcdef', branch: 'main', isolatedSources: sourceIndices,
    requiredRefs: ['.maintenance/portfolio/integrated.html', 'docs/project/PROJECT_ROADMAP.html'],
  });
  const withoutRow = original.replace(
    '<p><code>TASK-130</code> — source <b>REVIEW</b> em <code>.worktrees/TASK-130-owner</code>; integração no main bloqueada.</p>', '');
  const verified = readLanding(withoutRow, { total: 2, done: 1, active: 1, acceptance: 0 },
    'roadmap-hash', [], sourceIndices);
  assert.match(verified.errors.join('\n'), /TASK-130: visible isolated source status row is missing/);
});

test('generated landing visibly exposes source-index signature separate from roadmap SHA', () => {
  const html = renderLanding({
    counts: { total: 2, done: 1, active: 1, acceptance: 0 }, hash: 'roadmap-hash',
    mainHead: '0123456789abcdef', branch: 'main',
    isolatedSources: { items: [{ id: 'TASK-130', lifecycle: 'REVIEW', worktree: '.worktrees/TASK-130-owner' }],
      hash: 'source-index-hash' },
    requiredRefs: ['.maintenance/portfolio/integrated.html', 'docs/project/PROJECT_ROADMAP.html'],
  });
  assert.match(html, /SHA-256 do manifesto e metadados de identidade\/lifecycle: <code>source-index-hash<\/code>/);
  assert.match(html, /data-source-index-sha256="source-index-hash"/);
  assert.match(html, /<code>roadmap-hash<\/code>/);
});
