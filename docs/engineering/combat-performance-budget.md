# Combat Performance Baseline and Accepted Budget

## Status

**ACCEPTED BY HUMAN OWNER — performance budget accepted; publication guidance remains subject to its owning content-validation contract.**

This document records the TASK-011 measured baseline and the performance/content-publication
budget derived from that evidence. Independent QA and PM / Architecture Coordinator acceptance are
complete, and the Human Owner explicitly accepted the performance budget and periodic-schedule /
content-publication recommendation on 2026-09-15. The accepted recommendation does not invalidate
any currently accepted combat input; it becomes an enforced publication rule only when the owning
future content-validation contract adopts it.

Benchmark configuration identity: `task011-benchmark-v1`.

## Measurement boundary

The benchmark executes the built `@pokenexus/game-core` JavaScript under Node 24. The repository's
TypeScript build emits extensionless internal ESM specifiers, so the benchmark installs a local
`node:module registerHooks()` resolver before loading `dist`. The hook only appends `.js` to
extensionless relative imports whose parent is inside `packages/game-core/dist/`. Before delegating
to Node resolution it normalizes the candidate file URL/path and fails closed unless that canonical
target remains under the exact `dist` root; the untimed preflight includes an explicit `../` escape
rejection assertion. Module loading and hook execution are outside every timed window.

Scenario construction, TASK-010 fixture reuse, environment capture, semantic checksum validation,
report formatting and warm-up are also outside measured windows. The Battle timed path is minimal:
it invokes the built production `initializeBattle` / `resolveCombatStimulus` entrypoints as required,
carries only returned Battle/RNG state and performs scalar sink bookkeeping. Scheduled-effect and
multi-target scenarios pre-initialize immutable Battle state outside timing; the complete-terminal
scenario intentionally includes initialization because its workload unit is a complete Battle.
Cadence scenarios call the built production `advanceCadence` export directly.

The runner measures wall time with `process.hrtime.bigint()` and process CPU with
`process.cpuUsage()`. Every scenario runs in three fresh Node processes. Each process performs eight
discarded warm-up batches followed by 30 measured batches. Every measured batch must take at least
`100,000,000 ns` or the run fails closed. Percentiles use nearest-rank ordering:
`rank = ceil(p * N)`, one-based. The summary below reports the median across the three fresh-process
run-level p50/p95 values; run-to-run p50 and p95 wall/CPU min, max and relative spread are retained
because this workstation is not a noise-free lab host.

The timed loop necessarily contains loop control and scalar sink bookkeeping. A same-shape scalar
loop is measured separately as harness overhead and is orders of magnitude below the production
workloads; no subtraction is applied to the reported engine measurements.

## Reference environment

| Property | Reference value |
|---|---|
| Node | `v24.19.0` |
| V8 | `13.6.233.17-node.51` |
| OS | Windows `10.0.26200`, `win32 x64` |
| CPU | 13th Gen Intel(R) Core(TM) i7-13700 |
| Logical CPUs | 24 |
| Total memory | 51,243,266,048 bytes |
| Throughput process flags | none |
| Memory process flag | `--expose-gc` |

Absolute numbers below apply only to this reference environment and the exact scenario/configuration
identity. Results from another CPU, OS, Node/V8 build or materially different process environment are
not directly comparable.

## Semantic guard manifest

Before warm-up or timing, every worker runs two untimed fail-closed semantic checks. The retained
full-scenario manifest validates authoritative output end to end. A separate predeclared
**measured-path manifest** executes the same shared core used by the timed loop and pins a SHA-256 of
its exact starting Battle/cadence state, exact production-call/stimulus counts, timed-path
event/consequence counts, terminal outcome, final Battle State or cadence carry, and RNG
continuation. Expected values are static constants; they are not derived from the current run.

| Scenario | Full SHA-256 | Measured-path SHA-256 | Measured start SHA-256 | Timed events | Consequences | Boundaries |
|---|---|---|---|---:|---:|---:|
| `battle.terminal-replacement.v1` | `d455a5811f1077ede2fc1dbcbc800b4517d17e2d283bda9d4cdc8a5586b1c64f` | `335e16271986decff0dabcfa17bfd31d00921b67443f731fca31637b7dd72b82` | `f35fc6fbb29dc3b9565f4f3ae182902a5ffd61409513bf842ffec46c4aafa764` | 9 | 0 | 0 |
| `battle.scheduled-effects.v1` | `d7f67357c9bc853a324d89849d563ccdfda371e0b02c0a8440b9ed261c699be4` | `7a76b3f433326ee775894a7c59d4d3f321f20b4765bf7aada5cc490443ed78ee` | `5254bf56a140bab0d4bc0b32e3cb28f8802022309e182f3543c50a94be033ed0` | 7 | 0 | 3 |
| `battle.multitarget-rng.v1` | `fdcc3e3de098cf075abfb560e941f182f7f16f5dbd548afeeed1243591a722a4` | `fed19ecc1bbd00ad8ba7077ee6da942bb94266002fde3117edc5dd9e7b6c5bab` | `733267150504ac5607a22878be56cfd03544f44f18613a9ef3c940b4ad9b52fd` | 4 | 0 | 0 |
| `cadence.realistic-1h.v1` | `13a3697f54a164193df4f207256683ade8d32bc198a17cf72d7116b27385ebab` | `13d15517b25ef7d904f202147a633d5a41f7047df801c10197782279ea5cb810` | `02e007d688437ac81e91a12ace9f47a9d463f61047d1bc32d977c9b2b4b1958d` | 0 | 480 | 240 |
| `cadence.realistic-8h.v1` | `427e69ccde5808bc6d6c4bda09759a6e4d73fff93f5a260e565b2e3210de9778` | `700d283f105e8abec39d9f89c962d30dafe5660acb158a4544607363fc88c1bf` | `a29d7bfcd5fa41f6703a77847268b6cdc18c6fd0b5964b901d0450158faa11c4` | 0 | 3,841 | 1,921 |
| `cadence.pathological-boundaries.v1` | `83dcbc9ef2ebbc7ebe60c3ace7f3dd646bee0e5a4d5c6ae9c426b5e30dfdce2c` | `5b28a3c0774ee5fc073438819dc6e43dcdb152d548e61539181dd6dc346f3a35` | `28a79dd831db9edbc0e8a9470b6ff7045f09bc438389192ee168214b07570dc4` | 0 | 10,001 | 5,001 |

For the exact timed path, terminal/replacement includes one `initializeBattle` call and all seven
stored stimuli. Scheduled-effects and multi-target start from their preinitialized Battle states,
perform zero initialization calls inside the measured unit, and execute exactly two and one stored
stimuli respectively. Each cadence measured unit performs exactly one `advanceCadence` call. The
structured oracle and minimal scalar timed execution share the same Battle/cadence core functions,
so deleting/skipping a timed production call changes the preflight evidence.

The realistic cadence schedule uses a 15-second periodic interval over an eight-hour effect. The
pathological case is deliberately valid but dense: a 1 ms interval for five seconds. No tick or
expiry is aggregated or omitted.

## Measured baseline

| Scenario | Workload unit | Median run p50 wall | Median run p95 wall | Median run p50 CPU | Median run p95 CPU | p50 wall spread | Reference throughput |
|---|---|---:|---:|---:|---:|---:|---:|
| `battle.terminal-replacement.v1` | complete terminal Battle | 23.174 µs | 35.753 µs | 22.429 µs | 35.714 µs | 12.9% | 43,152 Battles/s |
| `battle.scheduled-effects.v1` | initialized scheduled-effect stimulus stream | 10.449 µs | 14.247 µs | 10.389 µs | 14.778 µs | 19.5% | 95,705 streams/s |
| `battle.multitarget-rng.v1` | initialized multi-target RNG/order action | 15.352 µs | 22.948 µs | 15.600 µs | 23.500 µs | 5.6% | 65,138 actions/s |
| `cadence.realistic-1h.v1` | one-hour advancement, 240 boundaries | 213.844 µs | 337.020 µs | 238.462 µs | 336.923 µs | 9.4% | 1,122,312 boundaries/s |
| `cadence.realistic-8h.v1` | eight-hour advancement, 1,921 boundaries | 1.609 ms | 2.636 ms | 1.750 ms | 2.738 ms | 4.1% | 1,193,957 boundaries/s |
| `cadence.pathological-boundaries.v1` | five-second 1 ms schedule, 5,001 boundaries | 4.460 ms | 6.610 ms | 4.406 ms | 6.375 ms | 5.4% | 1,121,301 boundaries/s |

The fresh-process spread demonstrates why regression evaluation must use repeated same-environment
runs rather than a single sample. Every one of the 540 measured batches was at least 100 ms.

| Scenario | Run p95 wall min–max | p95 wall spread | Run p95 CPU min–max | p95 CPU spread |
|---|---:|---:|---:|---:|
| `battle.terminal-replacement.v1` | 33.171–36.318 µs | 8.8% | 33.429–37.857 µs | 12.4% |
| `battle.scheduled-effects.v1` | 12.612–14.743 µs | 15.0% | 13.056–14.778 µs | 11.7% |
| `battle.multitarget-rng.v1` | 22.894–23.836 µs | 4.1% | 23.500–25.000 µs | 6.4% |
| `cadence.realistic-1h.v1` | 333.188–352.243 µs | 5.7% | 336.923–360.000 µs | 6.8% |
| `cadence.realistic-8h.v1` | 2.624–2.642 ms | 0.7% | 2.538–2.738 ms | 7.3% |
| `cadence.pathological-boundaries.v1` | 6.340–7.464 ms | 17.0% | 6.344–7.781 ms | 22.5% |

## Retained-memory evidence

Memory observation runs separately in fresh Node processes with `--expose-gc`. GC is forced once
before the baseline and after each of five workload epochs; no forced collection occurs inside the
throughput benchmark. `heapUsed`, RSS, `external` and `arrayBuffers` are recorded after each forced
collection.

| Scenario | Work per epoch | Last post-GC heap vs baseline | Post-GC heap range | Last RSS vs baseline |
|---|---:|---:|---:|---:|
| `battle.terminal-replacement.v1` | 1,000 | +634,856 B | 10,656 B | +4,403,200 B |
| `battle.scheduled-effects.v1` | 1,500 | +416,368 B | 24,800 B | +8,470,528 B |
| `battle.multitarget-rng.v1` | 2,000 | +323,984 B | 7,504 B | +3,387,392 B |
| `cadence.realistic-1h.v1` | 30 | +120,296 B | 27,896 B | +1,138,688 B |
| `cadence.realistic-8h.v1` | 5 | -184,688 B | 11,008 B | +4,952,064 B |
| `cadence.pathological-boundaries.v1` | 3 | +97,480 B | 25,320 B | +9,048,064 B |

After the first workload/heap growth, post-GC live heap remains within a narrow range (at most about
28 KB across the five post-GC epochs for these scenarios). `external` memory remains around 2.30 MB
and `arrayBuffers` remains at 143,611 bytes in the final cadence cases. RSS is substantially noisier
because V8/OS reserve pages and retain heap capacity; it is reported rather than treated as live
object retention. This evidence does not show obvious unbounded retained-memory growth.

No allocation profile was triggered: current throughput has substantial margin against the accepted
reference targets below and the mandatory post-GC evidence does not identify a material retained
allocation constraint. TASK-011 therefore preserves the current integrated engine unchanged rather
than profiling/optimizing speculatively.

## Accepted reference-environment budget

These values are deliberately headroom targets, not restatements of the observed best case.

| Scenario | Accepted absolute p95 wall ceiling | Accepted absolute p95 CPU ceiling |
|---|---:|---:|
| complete terminal Battle | 50 µs | 50 µs |
| scheduled-effect stimulus stream | 30 µs | 30 µs |
| multi-target RNG/order action | 50 µs | 50 µs |
| realistic one-hour cadence advancement | 0.75 ms | 0.75 ms |
| realistic eight-hour cadence advancement | 5 ms | 5 ms |
| bounded pathological 5,001-boundary advancement | 12 ms | 12 ms |

Additionally, the accepted cadence reference floor is **700,000 semantic boundaries/second** for
both realistic long-horizon and bounded pathological cadence scenarios. The measured p50 boundary
rates were approximately 1.12–1.19 million/second, so the floor leaves material headroom for normal
reference-environment noise without normalizing away a large regression.

The accepted minimum evidence to keep TypeScript as the current combat implementation is:

1. all predeclared semantic guards remain exact;
2. the reference-environment absolute p95 wall/CPU targets above pass under the same methodology;
3. cadence boundary throughput remains above the accepted floor;
4. realistic eight-hour explicit-time advancement completes within its target without aggregation;
5. repeated post-GC evidence does not show unbounded retained heap growth.

The current engine satisfies this accepted viability envelope. No production optimization is
recommended from the TASK-011 baseline.

## Accepted same-environment regression policy

For automated or release comparison on a materially equivalent environment, compare the same
scenario/configuration identity using three fresh processes and 30 measured batches/run. A result is
requires investigation when either:

- the median-of-three run p95 wall or CPU cost exceeds the accepted baseline by more than **40%**; or
- cadence semantic-boundary throughput falls by more than **30%** from the accepted same-environment
  baseline.

The +40% p95 alarm is deliberately above the relevant p95 run-to-run variability rather than being
derived from p50 noise: the largest observed p95 wall spread was 17.0%, and the largest observed p95
CPU spread was 22.5%, both in the bounded pathological scenario. The 40% threshold therefore leaves
substantial margin over this reference-host variability while still surfacing a material sustained
regression. It is an investigation alarm, not permission to consume the full absolute reference
budget permanently. A new Node/V8, OS, CPU or benchmark scenario version requires a new baseline
rather than pretending the measurements are directly interchangeable.

## Accepted periodic-schedule publication guidance

SPEC-003 requires exact due boundaries, so the publication guard should constrain authored density
rather than alter `advanceCadence`. Based on the measured boundary rate and the accepted 700,000/s
reference floor, TASK-011 records the following accepted future content-validation recommendation:

- cadence-scoped periodic authored effects have a default minimum periodic interval of **1,000 ms**;
- across concurrently applicable cadence effects for one participant, an eight-hour catch-up window
  may schedule at most **30,000 semantic periodic/expiry boundaries**;
- validation counts exact authored boundaries across effects; it must not assume aggregation;
- a content/rules owner may propose a different exception only with explicit measured evidence and
  the normal rules/content approval path.

A continuously active single effect at a one-second interval creates 28,800 ticks across eight hours
plus its expiry, fitting under the aggregate cap. At the accepted conservative 700,000-boundary/s
floor, 30,000 boundaries represent about 42.9 ms of pure cadence-boundary work on the reference
environment; at the measured long-horizon/pathological rates they are lower. Multiple concurrent
effects consume the same aggregate cap rather than each receiving an independent allowance.

This is a **publication recommendation only**. TASK-011 does not reject such inputs inside
game-core, modify accepted SPEC-003 semantics or enact a production catalog validator.

## Reproduction

Build first, then run the untimed semantic preflight, throughput/CPU benchmark and retained-memory
benchmark:

```text
corepack pnpm --filter @pokenexus/game-core build
node packages/game-core/benchmarks/preflight.mjs
node packages/game-core/benchmarks/run.mjs
node packages/game-core/benchmarks/run-memory.mjs
```

The package also exposes `benchmark:preflight`, `benchmark` and `benchmark:memory` convenience
scripts. Benchmark results must be interpreted with the exact environment and scenario/configuration
identity above; no number in this document authorizes a combat-semantic shortcut.
