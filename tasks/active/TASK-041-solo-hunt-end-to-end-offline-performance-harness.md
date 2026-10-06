# TASK-041 — Solo Hunt End-to-End, Offline & Performance Harness

## Metadata

- State: ACTIVE
- Class: B
- Execution gate: READY for the local/disposable Cards-only evidence subset under APPROVED SPEC-020/021; final first-Prealpha acceptance remains externally gated
- Owner: Software Developer (ChatGPT prime)
- Reviewer: independent QA + integrity review completed READY `0/0/0`; final Human first-Prealpha live acceptance remains separate
- Specs: APPROVED SPEC-015/016/017/020/021
- Dependencies: TASK-034-039/100/103/106-111
- Branch: `feat/TASK-041-first-prealpha-harness`
- Worktree: `.worktrees/TASK-041-first-prealpha-harness`

## Objective

Provide one reproducible first-Prealpha **Cards-only** local/disposable harness across the already-authoritative client and Solo Hunt runtime. The harness must validate offline/reconnect and active-Hunt automation behavior without fabricating authority that remains behind TASK-120/121, TASK-103 public enablement, TASK-100 eligible-Moves or Human live acceptance. TASK-119/SPEC-024 v1 is Human-approved and source-integrated through canonical merge `490b6de`.

## Authorized local scope

- Exercise the real web Hunt transport/correlation/Card tests, including the one-shot foreground handoff.
- Exercise real API offline/runtime/HTTP policy units.
- Exercise a selected set of real `hunt-application-postgresql` scenarios in one owned loopback/tmpfs PostgreSQL 17 container: exact 8h and sub-8h return targets, active-Hunt policy prospective ordering, automatic capture, Retreat/Revive ordering, D-F16 post-Battle Revive, in-Battle Revive activity and paged Activity reconnect.
- Record local step durations as diagnostics only; they are not Worker/Hyperdrive/production SLA evidence.
- Keep the first-Prealpha presentation Cards-only. Pixi parity remains TASK-040 and is explicitly deferred.

## Explicit external gates / non-goals

- Do not simulate TASK-119 Encounter-preview authority; consume the real approved source-integrated implementation.
- No TASK-120 durable terminal/offline-summary contract or migration.
- No TASK-121 historical manual-capture migration/compatibility implementation.
- No eligible-Moves GET or Move-editor authority.
- No TASK-103 public CombatPresentation route registration, persistent migration, deploy or public feed enablement.
- No production database, Hyperdrive, Pages/Worker deployment or fabricated production performance claim.

## Acceptance criteria

- [x] Harness is bounded to Cards-only first-Prealpha authority and declares excluded gates explicitly.
- [x] Web Hunt/Card/correlation subset passes from the harness.
- [x] API offline/runtime/policy unit subset passes from the harness.
- [x] Disposable PostgreSQL first-Prealpha scenario subset passes and owned container is removed.
- [x] Local duration report is emitted with an explicit non-SLA qualifier.
- [x] Independent QA/integrity review finds no unresolved P0/P1/P2 in the harness itself.
- [ ] TASK-119 authoritative pre-Start Encounter preview available and validated end to end. **Source integration is complete; later live/deployed validation remains.**
- [ ] TASK-103 public CombatPresentation GET available and validated by Cards.
- [ ] TASK-120 durable terminal/offline summary available and validated end to end.
- [ ] TASK-121 historical manual-capture compatibility resolved and validated.
- [ ] TASK-100 eligible-Moves / Move-editor authority resolved without local fallback.
- [ ] Human Owner performs final first-Prealpha live acceptance.

## Evidence

The local harness is `scripts/task-041-first-prealpha-harness.ps1`. It intentionally composes existing production-path tests rather than introducing a second gameplay simulator. PostgreSQL execution uses `scripts/test-postgresql-docker.ps1`, including its disposable `pokenexus_test_*` database guard, loopback-only ephemeral port, tmpfs storage, owned-container label check and cleanup.

Exact-current canonical-main run after merge `e7fa4d7` on 2026-10-06:

- Cards-only web subset: **35/35 PASS across 5 files** (`hunt-foreground-handoff`, command store, Hunt API, Card renderer and App routing).
- API offline/runtime/policy subset: **40/40 PASS across 4 files**.
- Disposable PostgreSQL first-Prealpha subset: **9/9 PASS** from the real `hunt-application-postgresql` suite; 41 unrelated cases were not selected. The runner reported `POSTGRESQL_INTEGRATION_EXIT=0` and removed its owned ephemeral container.
- Selected PostgreSQL scenarios cover exact 8h return freezing, sub-8h return, policy edit prospective ordering, automatic capture from locked Inventory, Retreat/Revive tie, D-F16 rollback/replay, in-Battle Auto-Revive activity and paged Activity reconnect/deduplication.
- The harness emitted `pokenexus.task-041-local-harness.v1`. Diagnostic elapsed times for this one canonical-main run were approximately **1.37s web subset**, **4.37s web build**, **10.46s API dependency prebuild**, **1.67s API unit subset**, **20.00s disposable PostgreSQL subset** and **0.35s roadmap check**. These values are explicitly **not** production SLA evidence.
- Roadmap check PASS at 122 tasks after lifecycle counts moved from ACTIVE 2 / PLANNED 47 to ACTIVE 3 / PLANNED 46. `git diff --check` PASS.
- Independent QA/integrity review re-gate after evidence hardening returned **READY, P0/P1/P2 = 0/0/0**. The review confirmed that ephemeral test-schema migrations are confined to the owned disposable PostgreSQL database; no persistent/production migration occurs; `externalGatesNotSimulated` and this checklist both preserve TASK-100 eligible-Moves / Move-editor authority as unresolved; TASK-120/121 and TASK-103 public presentation remain external, while TASK-119 is now source-integrated; no parallel gameplay simulator, deploy or public enablement was introduced; and TASK-041 correctly remains ACTIVE.

TASK-041 remains ACTIVE until its upstream/external gates and final Human first-Prealpha acceptance are satisfied. Passing the local harness does not make TASK-039, TASK-100 or TASK-103 DONE and does not authorize any excluded Class-A contract.
