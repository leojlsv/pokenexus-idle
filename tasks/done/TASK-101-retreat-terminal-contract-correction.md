# TASK-101 — TASK-038 Retreat Terminal Contract Correction

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: current ChatGPT implementation session
- Reviewer: independent QA Reviewer — PASS WITH P2 (no P0/P1)
- Reviewer execution surface: separate ChatGPT worker
- Auditor: Independent Auditor — PASS WITH P2 (no P0/P1)
- Auditor execution surface: separate ChatGPT worker
- Consultants: N/A
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-013 §5.4.1, SPEC-015 §8
- Related tasks: TASK-033, TASK-035, TASK-037, TASK-038, TASK-039
- Branch: `fix/TASK-101-retreat-terminal-contract`
- Worktree: `.worktrees/TASK-101-retreat-terminal-contract`
- Human product direction: continue the isolated TASK-038 correction; no new game/HTTP semantics accepted
- Repository/history: Human Owner authorized local commit and merge on 2026-09-28; push and deployment remain separately gated

## Objective

Restore the already-approved SPEC-015 public retreat response invariant:
`terminalReason` is only `retreat` or `no_living`, including a previously
terminalized Hunt for which the internal Combat Engine recorded
opposing-side victory or draw.

## Scope

- Normalize the authoritative Solo Hunt terminal disposition from losing or drawn
  Combat Engine outcomes to the accepted Hunt-level `no_living` disposition.
- Preserve combat outcome evidence, checkpoint/provenance, rewards, recovery
  anchor, pending selection, fixed cutoff and command-result replay bytes.
- For legacy terminal records whose stored reason is `draw` or
  `opponent_victory`, normalize the newly materialized *public retreat result*
  without reterminalizing or moving their immutable recovery anchor.
- Add focused regression for pre-existing draw/opposing victory terminal
  records and exact same-key replay; retain tests of already accepted retreat
  and automatic no-living paths.
- Escalate any already-completed public command record storing a now-disallowed
  reason separately; do not silently rewrite a frozen persisted command result.

## Out of scope

- Changing accepted SPEC-015 response unions, routes, error policies or timing.
- Rewriting historical command records or persisted Combat Engine outcomes.
- Changing Battle RNG, progression, rewards, automatic/manual capture, healing,
  recovery durations, or cardinality of active Hunts.
- Changing the TASK-039 UI from this server correction branch.
- Deployment or production data migration.

## Acceptance criteria

- [x] New retreat commands and converged pending retreat commands publish only
  `retreat` / `no_living` for every reachable Solo Hunt terminal case.
- [x] Already-terminal persisted source reason/cause is not silently changed in
  the legacy-convergence branch; no logical advancement or recovery shift.
- [x] Exact old/new same-key replay remains immutable; no cross-Hunt effects.
- [x] Losing/drawn Encounter has no completion reward, capture or pending
  selection consumption under SPEC-013.
- [x] Relevant API/Hunt PostgreSQL integration regressions, unit, lint,
  typecheck, build, roadmap and diff checks PASS.
- [x] Independent QA and IA report no unresolved P0/P1; P2 evidence gaps are recorded below.
- [x] Delegated Class-B functional/architectural acceptance for the isolated correction.
- [x] Human Owner authorized local Git commit/merge on 2026-09-28; no push or deployment authorized.

## Dependencies

- TASK-038 — DONE (existing implementation; this is a separately scoped
  corrective follow-up).
- TASK-033 / SPEC-013 — APPROVED.
- TASK-098 / SPEC-015 — APPROVED.

## Risks / irreversible actions

- Original terminal provenance and immutable public command replays must not
  be reinterpreted.
- A previously completed public retreat command may already carry a legacy
  `draw`/ `opponent_victory` payload; do not silently overwrite its result.
- Database integration tests may require a dedicated disposable PostgreSQL
  database. Do not reset/migrate a non-test database.

## Validation / handoff

Independent technical QA and IA reviewed the exact changed server bytes.
Integrate the accepted correction into canonical local main; keep the TASK-039 client worktree unchanged.

### Implementation and independent review evidence

- New terminal-disposition.ts centralizes accepted Solo Hunt losing/drawn outcome classification; deterministic Battle outcomes in game-core remain unchanged.
- Hunt application normalizes fresh terminalization from advancement, prelude and pending healing. Previously terminalized legacy records retain their stored reason; an unresolved retreat command now resolves to the approved public no_living result.
- Old **completed** command correlations still replay their exact historical status/body, even if predating this correction. A dedicated PostgreSQL test confirms no historical result is rewritten.
- Unit: API **166/166 PASS**, mapping **8/8 PASS**, game-core **460/460 PASS** (src and dist); API PostgreSQL **56/56 PASS** (19 Hunt); database PostgreSQL **87/87 PASS**.
- Root lint and dry-run build PASS. Root parallel typecheck encountered an existing nested shared-artifact EBUSY race; serialized workspace typecheck PASS. Roadmap and whitespace checks PASS.
- An interim API PostgreSQL test run collided with a focused run that simultaneously dropped the same disposable schema. The final **sequential repeat passed 56/56**; do not overlap database suites against one test schema.
- Independent technical QA and independent architectural/protocol auditor each returned **PASS WITH P2**, with no P0/P1 in the reviewed source. Both independently ran the 8/8 mapping unit tests and `git diff --check`. Their reviews did not rerun PostgreSQL integration tests against the shared disposable schema; the 56/56 API PostgreSQL result above is implementation evidence, not an independent rerun.
- **Deferred P2 (test coverage):** the added PostgreSQL cases seed existing `draw` and `opponent_victory` terminal records and test new pending-retreat convergence, old completed replay and recovery-anchor stability. An API-level end-to-end loss/draw → bounded `202` → terminalization regression, including concurrent healing and reward/capture/selection invariants, is not yet present. Existing game-core loss/draw tests check the no-completion semantics; neither reviewer identified a corresponding source bug.
- **Deferred P2 (historical replay compatibility):** a previously **completed** retreat correlation containing an old `draw`/`opponent_victory` result intentionally replays that result verbatim. The strict TASK-039 parser accepts only `retreat`/`no_living`; its current UI blocks new and stored retreat submission and allows deliberate state reconciliation. Enabling retreat must account for such old keys without mutating immutable command results. Any history-specific cutover/UX change needs its own accepted scope.
- No production deployment, push, database migration or user-owned Docker-container change. Completed TASK-038 and active TASK-039 worktrees remain unchanged.
- **Gate:** Class-B correction accepted; local Git commit/merge authorized separately by Human Owner on 2026-09-28. TASK-039 Retreat stays disabled until its client-side enablement and historical-replay handling are separately validated. Push and deployment remain gated.
