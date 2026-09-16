# TASK-011 — Combat Performance Baseline

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer assignment; Copilot CLI unavailable due account quota during task preparation)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent Codex review session
- Auditor: N/A
- Auditor execution surface: N/A
- Specs:
  - `docs/specs/SPEC-003-combat-rules-v1.md`
- ADR:
  - `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
- Branch: `feat/TASK-011-combat-performance-baseline`
- Worktree: `.worktrees/TASK-011-combat-performance-baseline`

## Objective

Measure the integrated deterministic Combat Engine delivered by TASK-009 and verified by TASK-010,
establish a reproducible Node 24 performance baseline, and turn measured evidence into an explicit
Human Owner-accepted performance budget plus content-publication guidance for periodic schedules.

The task must determine whether the current TypeScript engine is viable for expected deterministic
combat/offline workloads before later Hunt/realtime content depends on it. Measurement comes before
optimization: TASK-011 must not change accepted combat semantics, skip replay-visible work, or invent
content rules merely to improve benchmark numbers.

## Context

TASK-009 and TASK-010 are DONE and integrated on `main`. The exact TASK-011 baseline is
`de1607d23d03f8160bcaefea7316ff2cf3634a01`.

ADR-004 requires one pure deterministic engine with explicit RNG/time and allows optimization only
without changing accepted observable semantics. SPEC-003 section 25.1 explicitly warns that cadence
cost scales with the number of due semantic effect boundaries: tiny `intervalMs` values over long
durations can generate a large exact workload, and the engine may not silently aggregate or skip
those boundaries. TASK-011 therefore owns measurement and publication-limit evidence, not a semantic
shortcut.

The roadmap requires the Human Owner to accept the resulting performance budget. That gate is an
output/acceptance decision of this task: implementation may measure the current engine first, then PM
/ Architecture Coordinator presents the measured budget and content-limit recommendation for Human
Owner approval before the task can complete.

## Scope

### 1. Reproducible benchmark harness

- add a deterministic benchmark runner for the built `@pokenexus/game-core` implementation using the
  repository's pinned Node 24 runtime;
- benchmark production resolver entrypoints rather than reimplementing combat math inside the
  harness;
- current `tsc` output uses extensionless relative ESM specifiers that Node 24 does not resolve
  directly. Keep production/build output unchanged and use a benchmark-only `node:module`
  `registerHooks()` resolver shim that appends `.js` only for relative extensionless imports under the
  game-core `dist` tree. Register that shim before dynamic import and outside every measured window;
  it must fail closed for unresolved/non-local specifiers and must not rewrite engine source/API;
- reuse TASK-010 fixture builders/data where useful, while keeping benchmark-only orchestration out
  of the public runtime API;
- add no external dependency and make no lockfile dependency/importer change. `package.json` may add
  benchmark script entries only. If implementation demonstrates a genuine need for a new dependency,
  amend the task contract and repeat readiness review before adding it;
- capture enough environment metadata to interpret results: Node version, platform/architecture,
  logical CPU count/model when available, process/runtime flags and benchmark configuration;
- provide deterministic scenario IDs/config versions and stable semantic evidence so a fast result
  cannot come from accidentally skipping required work;
- declare a versioned expected-semantic manifest for every measured scenario, including a fixed
  canonical SHA-256 digest over ordered authoritative output plus explicit `eventCount`,
  `consequenceCount`, due-boundary count when applicable, terminal outcome, final Battle/cadence
  state and deterministic RNG expectations relevant to that scenario. An untimed preflight must
  match those predeclared values; a checksum recomputed from whatever the current runner happens to
  produce is not sufficient;
- keep fixture/context construction, serialization/checksum validation, result/report formatting,
  warm-up and environment discovery outside the measured window. The timed section must contain the
  production resolver/time-advancement operations being benchmarked; if unavoidable harness overhead
  remains inside a measured batch, measure and label it explicitly rather than hiding it;
- keep benchmark timing/allocation observation outside authoritative engine semantics.

### 2. Benchmark methodology

- run a discarded warm-up phase before measured samples so JIT/startup cost is not confused with
  steady-state engine throughput;
- execute at least `3` independent measured runs per benchmark scenario and at least `30` measured
  sample batches per scenario/run so p95 is not inferred from a statistically meaningless tiny set;
- execute each independent measured run in a fresh Node process so prior-scenario JIT/heap history
  cannot silently become part of cross-run variance;
- record at least median and p95 wall/CPU measurements over those measured sample-batch deltas for
  the relevant workload unit;
- define percentile calculation deterministically as nearest-rank over ascending sample-batch values
  (`rank = ceil(p * N)`, one-based; median uses `p=0.50`, p95 uses `p=0.95`) and state it in output;
- use batches long enough to reduce timer-resolution noise and report the exact per-sample batch
  duration/iteration count plus run/sample counts;
- measure scenarios sequentially or otherwise isolate them enough that concurrent benchmark work
  does not distort deterministic engine measurements;
- reference memory evidence must use explicit `--expose-gc`/forced collection and distinguish
  retained heap/RSS observations from transient allocation rate;
- run reference memory diagnostics in fresh processes with `--expose-gc`; force GC before the
  retained-memory baseline and after each repeated diagnostic epoch, never inside the throughput
  timing window; record at least `heapUsed`, RSS, `external` and `arrayBuffers` before/after plus the
  repeated post-GC trend;
- measure wall-clock deltas with a monotonic high-resolution clock (`process.hrtime.bigint()` or
  equivalent) and CPU deltas with `process.cpuUsage()`; do not infer CPU time from wall time;
- report run-to-run variance across the independent measured runs on the same reference environment,
  including run-level medians/p95s plus min/max and relative spread against the run-level median;
- do not treat raw results from different hardware/OS/Node versions as directly comparable without
  recording that environment difference.

### 3. Representative active-Battle workloads

- measure a small complete deterministic Battle scenario that reaches terminal outcome and exercises
  normal initialization/action/event/state work;
- measure an effect/time-advancement scenario with scheduled boundaries rather than only direct
  single-hit arithmetic;
- include at least one multi-target/RNG/order-relevant scenario so the baseline is not restricted to
  the cheapest branch;
- report useful throughput units such as completed Battles/sec and/or accepted transitions/sec, but
  keep scenario identity explicit so unlike workloads are not merged into one misleading number.

Minimum stable scenario identities/configuration families:

- `battle.terminal-replacement.v1` — complete terminal Battle with replacement path;
- `battle.scheduled-effects.v1` — explicit time advancement through scheduled Battle effects;
- `battle.multitarget-rng.v1` — multi-target resolution with RNG/order-relevant work.

### 4. Cadence and periodic-boundary workloads

- measure cadence advancement through the same production `advanceCadence` evaluator used by the
  engine;
- include a realistic periodic schedule case representative of future Hunt attrition/effect usage;
- include a deliberately pathological but valid tiny-interval schedule that creates many exact
  semantic boundaries without changing engine rules;
- report semantic effect-boundary throughput for both realistic and pathological cases;
- preserve exact consequences/state/RNG semantics and verify the amount of due work actually
  processed; no tick aggregation, coalescing or omission is allowed merely for benchmark speed.

Minimum stable scenario identities/configuration families:

- `cadence.realistic-1h.v1` — realistic periodic cadence workload advanced by one simulated hour;
- `cadence.realistic-8h.v1` — the corresponding eight-hour long-horizon workload;
- `cadence.pathological-boundaries.v1` — bounded valid tiny-interval workload sized to measure exact
  semantic boundary throughput without turning normal CI/development into an unbounded stress run.

### 5. 1h / 8h elapsed-time advancement evidence

- benchmark deterministic elapsed-time advancement equivalent to at least `1h` and `8h` for a
  bounded realistic cadence workload;
- exercise the existing explicit-time API directly; do not simulate elapsed time with wall-clock
  sleeps or per-millisecond polling;
- record elapsed wall/CPU time, relevant boundary count and resulting deterministic state;
- distinguish realistic long-horizon evidence from pathological stress. A pathological 1 ms effect
  does not need to run for eight simulated hours if a smaller exact sample establishes boundary
  throughput and supports a safe publication-limit decision.

### 6. CPU, memory and allocation evidence

- report p95 CPU cost for the core representative scenarios in a clearly defined unit;
- record RSS/heap evidence across repeated workloads and detect obvious unbounded retained-memory
  growth;
- perform allocation profiling or equivalent evidence sufficient to identify dominant avoidable
  allocation hotspots only if baseline evidence is materially constrained or memory growth is
  suspicious; base retained-memory/GC evidence is mandatory, heavyweight allocation profiling is
  conditional diagnostic work;
- do not claim exact per-object allocation accounting when the Node/V8 measurement surface does not
  support it reliably; document the metric actually measured.

### 7. Performance-budget and content-publication decision

- after measurement, produce a concise stable engineering budget based on the observed reference
  environment and expected project workloads;
- distinguish **reference-environment absolute targets** from **same-environment regression limits**
  so CI/developer machines are not falsely compared as if hardware were identical;
- define the minimum evidence required to keep TypeScript as the current combat implementation;
- recommend a maximum supported periodic-boundary density / minimum publishable periodic interval or
  an equivalent deterministic content-validation rule supported by the benchmark data;
- keep the recommendation generic to combat-rule content. TASK-011 must not author actual production
  Move/Ability/effect catalogs;
- record the final measured baseline and accepted budget in a stable engineering contract, not an
  ad-hoc benchmark report/changelog;
- require explicit Human Owner acceptance of the proposed budget/content-limit recommendation before
  TASK-011 can reach DONE.

### 8. Optimization boundary

- first measure the current integrated engine unchanged and preserve that baseline;
- if evidence shows a material hotspot, identify it with profiling before proposing optimization;
- no optimization may change Combat Events, ordering, RNG consumption, logical time, state,
  cadence consequences, rejection atomicity or any other ADR-004/SPEC-003 observable contract;
- production optimization is not authorized by TASK-011's initial measurement scope. If measured
  evidence justifies a production resolver change, materialize a follow-up optimization/fix task (or
  explicitly revise TASK-011's contract and repeat readiness review before adding production write
  targets); do not expand the READY implementation boundary ad hoc;
- performance evidence must never justify silently rejecting currently valid rule inputs. A new
  content-publication restriction becomes authoritative only after the owning validation/content
  contract adopts the Human Owner-accepted limit.

## Out of scope

- changing damage formulas, RNG semantics, timing, cooldowns, effects, cadence, KO/replacement or
  any other accepted combat rule;
- adding Move selection/AI/Hunt lifecycle orchestration;
- benchmarking API/database/Cloudflare/realtime transport, frontend rendering or network latency;
- release-scale load/stress qualification owned by TASK-082;
- full Solo Hunt end-to-end/offline claim performance owned by TASK-041 and TASK-037;
- production content catalogs or publication pipelines;
- broad engine rewrites, alternate-language kernels or native/WASM implementations without measured
  evidence and a separately accepted architecture decision;
- changing the public `@pokenexus/game-core` runtime API solely for benchmarking;
- introducing hidden wall-clock/RNG behavior into game-core;
- new external benchmark/profiling dependencies;
- any `pnpm-lock.yaml` dependency/importer change for TASK-011 benchmark tooling;

## Acceptance criteria

- [x] A deterministic, reproducible benchmark harness exercises the built authoritative Combat Engine
      without a second combat resolver or public runtime API expansion.
- [x] Built `dist` execution uses only the benchmark-local Node 24 resolver shim needed for current
      extensionless relative ESM specifiers; the shim is registered outside timed windows and does not
      alter production source/output semantics.
- [x] Benchmark output records environment/config/scenario identity and deterministic semantic
      evidence sufficient to detect accidentally skipped work.
- [x] Every measured scenario has a predeclared versioned expected-semantic manifest with canonical
      SHA-256 digest and explicit authoritative counts/outcome/state-or-cadence/RNG expectations, and
      untimed preflight validation fails closed on mismatch.
- [x] Methodology includes discarded warm-up, at least 3 independent measured runs and at least 30
      measured sample batches per scenario/run, with median/p95 reporting and exact batch
      duration/iteration configuration.
- [x] Timed windows contain the production resolver/time-advancement operations under measurement and
      exclude fixture construction, serialization/checksum validation, reporting, environment
      discovery and warm-up; unavoidable harness overhead is separately measured/labeled.
- [x] Representative active-Battle benchmarks include complete terminal combat, scheduled effect/time
      work and multi-target/RNG/order-relevant work.
- [x] Cadence benchmarks report exact semantic effect-boundary throughput for realistic and
      pathological valid periodic schedules without aggregating or omitting required boundaries.
- [x] Deterministic `1h` and `8h` realistic elapsed-time advancement benchmarks complete through the
      production explicit-time path with boundary counts and resulting deterministic state recorded.
- [x] CPU evidence includes p95 cost for the defined representative units; memory/allocation evidence
      uses fresh `--expose-gc` diagnostic processes, post-GC repeated `heapUsed`/RSS/external/
      arrayBuffers evidence, and detects obvious retained-memory growth; heavyweight allocation
      profiling is required only when baseline evidence is materially constrained/suspicious.
- [x] The current integrated baseline is measured before any optimization work.
- [x] Any later optimization proposal and the TASK-011 publication-limit recommendation are supported
      by measured/profiled evidence and preserve all ADR-004/SPEC-003 semantics; TASK-011 itself does
      not modify production resolver code under its initial READY scope.
- [x] A stable performance-budget contract distinguishes absolute reference-environment targets from
      same-environment regression limits and documents the benchmark methodology/scenario versions.
- [x] A concrete periodic-schedule publication-limit recommendation is produced from measured
      boundary throughput; the benchmark task itself does not silently make previously valid engine
      inputs invalid.
- [x] Human Owner explicitly accepts the proposed performance budget and periodic-schedule/content
      limit before TASK-011 is complete.
- [x] Existing TASK-009/TASK-010 deterministic/replay tests remain green.
- [x] No unrelated production/package/dependency changes are introduced.
- [x] No external dependency or lockfile importer/dependency change is introduced; `package.json`
      changes, if any, are benchmark script entries only.
- [x] Focused `@pokenexus/game-core` lint/typecheck/test/build pass.
- [x] Workspace typecheck/test/build pass with no unrelated regression.
- [x] Benchmark command(s) complete successfully on the recorded reference environment.
- [x] `corepack pnpm roadmap:check` and `git diff --check` pass.
- [x] Independent QA reports no unresolved P0/P1 findings.
- [x] PM / Architecture Coordinator acceptance passes after QA and before the Human budget gate.

## Validation / tests

Run and report at least:

```text
corepack pnpm --filter @pokenexus/game-core lint
corepack pnpm --filter @pokenexus/game-core typecheck
corepack pnpm --filter @pokenexus/game-core test
corepack pnpm --filter @pokenexus/game-core build
<TASK-011 benchmark command(s), repeated as defined by the harness>
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:check
git diff --check
```

Also inspect the complete branch diff against `origin/main` and verify no changes exist outside the
declared benchmark/task/roadmap/budget-document boundaries.

Benchmark results must be reported with exact scenario IDs, environment metadata and sample
configuration. Do not report a throughput/latency number without the workload unit it measures.

## Dependencies

- TASK-007 — ADR-004 Universal Combat Engine Architecture: DONE.
- TASK-008 — Combat Rules Spec v1: DONE.
- TASK-009 — Deterministic Combat Engine v1: DONE and integrated.
- TASK-010 — Combat Fixtures, Replay & Property Harness: DONE and integrated.
- SPEC-003 — Combat Rules v1: APPROVED.
- ADR-004 — Universal Deterministic Combat Engine Architecture: ACCEPTED.

## Risks / irreversible actions

- Microbenchmarks are hardware/JIT/GC sensitive. Absolute thresholds require a recorded reference
  environment; regression thresholds should compare the same environment and scenario version.
- A benchmark harness can accidentally measure test/harness overhead instead of production resolver
  cost. Scenario setup and measured sections must make the boundary explicit.
- Tiny periodic intervals can create intentionally huge exact workloads. Stress cases must remain
  bounded so normal development/CI does not hang while still producing evidence for publication
  limits.
- Memory metrics can be noisy under V8 GC. Report the actual methodology instead of treating one RSS
  sample as deterministic truth.
- Optimizing before measuring can destroy the baseline and encourage speculative complexity.
- No irreversible action is required. Commit/push/merge remain separately governed by Git policy and
  explicit Human Owner authorization.

## Expected files / boundaries

Primary TASK-011 boundary:

```text
packages/game-core/benchmarks/**
packages/game-core/package.json                    # benchmark script only if needed
docs/engineering/combat-performance-budget.md      # stable accepted budget/limit contract
tasks/active/TASK-011-combat-performance-baseline.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

TASK-010 test fixtures under `packages/game-core/src/testing/**` may be imported/reused by the
benchmark harness but are not production-semantic write targets. Production resolver modules are not
TASK-011 write targets. Any production optimization requires a follow-up task or explicit TASK-011
contract amendment plus repeated readiness review before production write targets are added.

## Completion

TASK-011 is complete only after benchmark implementation/validation, independent QA, PM /
Architecture Coordinator acceptance, and explicit Human Owner acceptance of the resulting
performance budget/content-publication recommendation. Repository completion/history remains
separately governed by Git policy.

Human Owner acceptance of the performance budget and periodic-schedule/content-publication
recommendation was received on 2026-09-15. Repository completion/history authorization was also
received on 2026-09-15. The accepted feature was integrated into `main` by fast-forward and pushed
successfully at `b0bb30de4167f1d3754e15546d68aba306286235`. TASK-011 is now recorded `DONE`.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
