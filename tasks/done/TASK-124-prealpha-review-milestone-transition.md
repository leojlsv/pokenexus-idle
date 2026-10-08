# TASK-124 — Pre-alpha Baseline Review & PA-M0→PA-M1 Transition Gate

## Metadata

- State: DONE
- Class: B
- Owner: PM / Architecture Coordinator (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A — this task reviews accepted/provisional evidence and does not define new gameplay/economy rules
- Consultant execution surface(s): N/A
- Spec: N/A
- ADR: N/A
- Branch: `docs/TASK-124-prealpha-review-milestone-transition`
- Worktree: `.worktrees/TASK-124-prealpha-review-milestone-transition`
- Completion integration: accepted candidate committed as `2b561ec`, pushed to `origin/docs/TASK-124-prealpha-review-milestone-transition`, and merged into canonical `main` as `5f20e8e`; post-integration control handback completed in canonical root `main` under the separately authorized history-integration step.

## Objective

Reconcile the project control plane for the final local Pre-alpha review, allocate the validated
PokeNexus skills to the remaining validation/future milestones, and prepare an evidence-bounded
Human Owner gate for the transition from **PA-M0 — Local Environment Validation** to
**PA-M1 — Core Gameplay Loop Validation**.

This task coordinates evidence and roadmap state only. It must not silently integrate application
bytes, approve another task, or change gameplay/architecture contracts.

## Context

- Canonical integrated local `main` is the repository control-plane baseline.
- `TASK-122` has a later source worktree with additional Human-directed local Pre-alpha work and
  evidence, including a source-task `ACCEPTANCE` state, but those dirty application/spec bytes are
  not thereby integrated into canonical `main`.
- The Human Owner authorized the control-plane/skill adjustments needed to perform a final
  Pre-alpha review before advancing the next validation milestone.
- The local validation milestones are namespaced `PA-M0..PA-M6` so they cannot be confused with
  the project-wide `M0..M10` delivery sequence.

## Scope

1. Add the validated project-local PokeNexus skills to the roadmap catalog with explicit advisory
   boundaries and stable `SK-PNX-*` codes.
2. Allocate those skills to the local Pre-alpha milestones and to the active/planned tasks where
   they materially improve test planning, runtime/replay evidence, visual regression,
   observability, realtime validation, balance simulation or final readiness gating.
3. Reconcile roadmap wording that still presents resolved TASK-122 source-worktree blockers as
   current facts, while clearly distinguishing **integrated-main capability** from
   **provisional/unintegrated source evidence**.
4. Preserve current `PA-M0` → `PA-M1` sequencing until the Human Owner completes the review;
   this task prepares the transition and does not self-advance it.
5. Build the Human review around explicit evidence status:
   `CURRENT`, `STALE`, `NEEDS_RUN`, `NOT_AUTHORIZED`, `OUT_OF_SCOPE`, plus a distinct
   `PROVISIONAL_SOURCE` label for evidence that is valid in an owning worktree but not integrated
   into canonical `main`.
6. Surface the remaining PA-M1/manual/live gaps separately from observability acceptance or
   bounded sub-delta READY verdicts.
7. Regenerate and validate the roadmap/portfolio control plane after edits.

## Required skill routing

- `SK-PNX-FLOW` / `pokenexus-dev-flow` — routing and scope discipline.
- `SK-PNX-PLAN` / `pokenexus-test-planner` — review matrix and evidence/gate mapping.
- `SK-PNX-RUNTIME` / `pokenexus-runtime-tester` — existing runtime evidence classification;
  no state-mutating reruns without the owning task/environment authority.
- `SK-PNX-REPLAY` / `pokenexus-replay-debugger` — deterministic historical incident/replay
  evidence when relevant.
- `SK-PNX-VISUAL` / `pokenexus-visual-regression` — rendered evidence for visible Pre-alpha
  surfaces; missing render evidence must remain explicit.
- `SK-PNX-OBS` / `pokenexus-observability-test` — bounded diagnosability review only for the
  transitions actually exercised.
- `SK-PNX-RELEASE` / `pokenexus-release-gate` — `WHOLE_TASK` technical gate for this control-plane
  task and scoped readiness framing for the Human Pre-alpha review.
- `code-review` — independent diff/document consistency review.

`SK-PNX-BAL` is reserved for PA-M4 or an explicitly scoped Human balance question. `SK-PNX-RT`
does not apply to the current local Pre-alpha review unless an accepted realtime/Duo scope is
explicitly introduced.

## Human Pre-alpha review packet

This section is the review input, not the Human decision. It deliberately separates canonical
integrated evidence from the later TASK-122 owning-source candidate.

### Evidence status legend

- `CURRENT` — evidence belongs to the canonical integrated candidate/control plane and remains
  applicable to the reviewed boundary.
- `PROVISIONAL_SOURCE` — evidence exists in the owning TASK-122 worktree, but the application/spec
  bytes that produced it are not integrated into canonical `main`.
- `NEEDS_RUN` — the Human/live/manual evidence is still required for the stated review boundary.
- `OUT_OF_SCOPE` — deliberately belongs to another accepted/DRAFT task or later PA milestone.
- `NOT_AUTHORIZED` — would require an environment/public/production action not authorized here.

### PA-M0 exit evidence

| Review item | Status | Evidence / interpretation | Transition consequence |
|---|---|---|---|
| Owned local PostgreSQL lifecycle, Doctor/Start/Reset/Status/Smoke/Stop and process ownership | `CURRENT` | Integrated TASK-122 baseline has green launcher/local lifecycle and independent QA/integrity evidence. | Supports PA-M0. |
| Immutable local v5 delivery and local-only API/session isolation | `CURRENT` | Integrated operator baseline plus TASK-123 Workerd redirect compatibility are repository-integrated. | Supports PA-M0. |
| One/two-ALT account isolation | `CURRENT` | Integrated baseline records concurrent self-scope isolation and fail-closed foreign mutation checks. | Supports PA-M0. |
| Genuine trusted bootstrap with the Human-approved 12-Species Genetic authority | `PROVISIONAL_SOURCE` | Owning TASK-122 source reports 12/12 preflight plus real A/B bootstrap; canonical main task still predates these bytes. | Human must decide whether provisional source evidence is sufficient to enter PA-M1 before separate history integration. |
| Forward starter Level 5 / XP124 and bounded A/B conversion | `PROVISIONAL_SOURCE` | Human-approved source direction is recorded under source SPEC-027; source reports disposable PG gates, real Apply/replay/Check and preserved provenance. SPEC-027/application bytes are not integrated here. | Not presented as integrated-main capability. |
| Evidence provenance / milestone / skill routing is unambiguous | `CURRENT` | TASK-124 distinguishes integrated vs provisional bytes, namespaces PA milestones and maps project-local skills. Roadmap/portfolio gates must remain green. | Required control-plane condition for transition. |

### PA-M1 evidence already available

| Review area | Status | Evidence / interpretation |
|---|---|---|
| Core deterministic Hunt/capture/reward/offline/automation authorities | `CURRENT` | TASK-035/036/037/038/107/108/109/110 are integrated under their accepted contracts; TASK-041 provides integrated local/disposable harness evidence. |
| Collection/Teams/Inventory/HUB management foundations | `CURRENT` | Integrated Player-state/runtime/UI foundations exist; open TASK-039/100 gates remain explicitly separate. |
| Real local Hunt start/sync, multi-member Team, capture, reward/XP, terminal `no_living`, policy automation and Retreat recovery | `PROVISIONAL_SOURCE` | Later TASK-122 source/live evidence exercises these paths and records bounded QA/IA; do not project it onto integrated-main bytes. |
| Reward synchronization exact-key replay / exactly-once completion | `PROVISIONAL_SOURCE` | TASK-122 source reports original checkpoint recovery and same-key HTTP 200 replay with one Reward Resolution/Completion. |
| Captured-Pokémon inactive Ability admission correction | `PROVISIONAL_SOURCE` | Source reports focused API/web regression evidence; implementation is not integrated here. |
| Policy minimum-reserve ownership bound | `PROVISIONAL_SOURCE` | Source reports web/PG/Smoke gates and server-side inventory locking/recheck; current rendered evidence for the final UI delta is not recorded. |
| Hunt Result/Activity diagnosability | `PROVISIONAL_SOURCE` | Human explicitly reported no remaining observability-level problem for the exercised scope; this does not cover adjacent unexercised flows. |

### Remaining Human/live evidence for PA-M1

| Review item | Status | Why it remains open |
|---|---|---|
| Full player-guide/manual T1–T8 / PA-M1 walkthrough | `NEEDS_RUN` | The source guide exists, but TASK-122 explicitly does not claim the whole manual suite executed/accepted. |
| Clean Auto-Revive live use | `NEEDS_RUN` | Explicitly excluded from the bounded observability acceptance. |
| Broader policy editing while Hunt is active | `NEEDS_RUN` | Source validates policy mechanics, but the broader Human interaction/UX pass remains open. |
| Long real/offline-return coverage up to the accepted 8h cap | `NEEDS_RUN` | Automated deterministic/harness coverage exists; extended Human/live return validation remains separate. |
| Minimum-reserve final rendered state | `NEEDS_RUN` | Functional tests/Smoke exist, but no representative render/screenshot of the latest ownership-bound UI is recorded; classify as `VISUAL EVIDENCE INSUFFICIENT` until rendered. |

### Explicitly deferred or separately gated

| Capability | Status | Owner/gate |
|---|---|---|
| Durable terminal/offline summary | `OUT_OF_SCOPE` | TASK-120 / DRAFT SPEC-025 Class-A decision. |
| Historical manual-capture compatibility/migration | `OUT_OF_SCOPE` | TASK-121 / DRAFT SPEC-026 Class-A decision. |
| Public CombatPresentation enablement/persistent migration | `OUT_OF_SCOPE` | TASK-103/public enablement gates; not required to prove the local PA-M0 environment. |
| Eligible-Moves / full Move editor authority | `OUT_OF_SCOPE` | TASK-100 remains deliberately fail-closed on the missing approved public read. |
| Production deployment/public URL/production DB migration | `NOT_AUTHORIZED` | EPIC-11/Human release gates only. |

### Human transition decision

**Human Owner decision: ACCEPT PA-M0 → PA-M1**, explicitly authorized on 2026-10-07
(2026-10-08T01:19:23Z).

Consequences of the accepted transition:

1. `PA-M0 — Local Environment Validation` is complete and no longer the current local-validation
   milestone.
2. `PA-M1 — Core Gameplay Loop Validation` becomes the current milestone.
3. TASK-122 `PROVISIONAL_SOURCE` bootstrap/Level-5/live evidence remains provisional until its own
   separately authorized repository-history integration; this decision does not promote those bytes
   to canonical-main `CURRENT` evidence.
4. The `NEEDS_RUN` PA-M1 items remain active validation gates inside PA-M1 rather than blockers that
   keep PA-M0 open.
5. TASK-120/121, public presentation, eligible-Moves and production/release capabilities remain under
   their existing separate authority.

## Out of scope

- Copying or integrating dirty TASK-122 application/test/spec bytes into `main`.
- Marking TASK-122 `DONE` or claiming its repository-history gate is complete.
- During REVIEW/ACCEPTANCE, commit/push/merge/rebase remained out of scope until separately authorized. Human Owner subsequently authorized the required commit/push/merge for repository-history integration; deployment, public enablement and production migration remain out of scope.
- Implementing DRAFT TASK-120 / SPEC-025 or TASK-121 / SPEC-026.
- Changing accepted gameplay, economy, Genetics, combat, progression or realtime semantics.
- Manufacturing missing authority or treating live/local evidence as production evidence.
- Automatically advancing PA-M0 to PA-M1 without the Human Owner review/decision.

## Acceptance criteria

- [x] Project-local `SK-PNX-*` skill catalog is present and clearly distinct from external skill
      adoption entries.
- [x] PA-M0..PA-M6 milestone names are unambiguous relative to project-wide M0..M10.
- [x] Each PA milestone has a concise primary PokeNexus skill allocation.
- [x] Active/near-term Pre-alpha tasks and EPIC-11 operational/release gates reference the
      applicable new PokeNexus skills without rewriting historical completed-task evidence.
- [x] Roadmap explicitly distinguishes canonical integrated `main` from the later TASK-122 source
      worktree and does not claim unintegrated application/spec bytes are present in `main`.
- [x] Stale “Genetic Profile pairs unavailable” wording is removed as a current source-worktree
      blocker; its resolution is labeled provisional/unintegrated where appropriate.
- [x] Human review scope lists PA-M0 exit evidence, PA-M1 readiness gaps, deferred/public gates,
      visual-evidence gaps and manual/live validation still required.
- [x] No bounded DELTA READY/observability verdict is promoted into a whole-Pre-alpha approval.
- [x] `corepack pnpm roadmap:generate` and `corepack pnpm roadmap:check` pass.
- [x] `corepack pnpm portfolio:generate-local` and `corepack pnpm portfolio:check-local` pass or
      any pre-existing/non-task blocker is recorded precisely.
- [x] `git diff --check` passes.
- [x] Independent QA finds no unresolved P0/P1 and no material control-plane ambiguity.
- [x] PA-M0 remains current until the Human Owner explicitly accepts the transition to PA-M1.
- [x] Human Owner explicitly accepted PA-M0 → PA-M1; PA-M1 may become the current validation milestone.
- [x] A durable post-integration control handback to canonical root `main` is defined and supported
      without deleting or reassigning source worktrees.
- [x] Repository-history integration was separately authorized; the accepted candidate was merged into canonical `main`, and TASK-039/041/100/103/122 control metadata was handed back to `main` / `.` with source history preserved.

## Validation / tests

- Read-only comparison of canonical `main` roadmap/task metadata against the TASK-122 source
  worktree evidence.
- Roadmap generator/checker.
- Local portfolio generator/checker.
- `git diff --check`.
- Independent QA review of task/roadmap/skill allocation and milestone semantics.

## Post-integration control handback

Completed after the Human Owner separately authorized repository-history integration:

1. accepted TASK-124 control-plane bytes were committed/pushed on the task branch and merged into canonical `main`;
2. TASK-039/041/100/103/122 now use `Control branch: main` and `Control worktree: .`;
3. every `Source branch` / `Source worktree` or original implementation `Branch` / `Worktree` remains unchanged so historical ownership/evidence stays recoverable;
4. roadmap and local portfolio are regenerated/checked from canonical root `main` before the closure commit/push;
5. TASK-124 may therefore close as `DONE` without implying TASK-122 source-byte integration, deployment, public enablement or production authority.

`scripts/project-portfolio-local.mjs` accepts `.` only as the canonical root worktree reference; ordinary task worktrees continue to use `.worktrees/<name>`.

## Dependencies

- TASK-003 / TASK-104 project-control governance.
- TASK-039 / TASK-041 / TASK-100 / TASK-103 for open Pre-alpha client/presentation gates.
- TASK-109 / TASK-110 / TASK-111 for the integrated management-first runtime baseline.
- TASK-122 owning source worktree and its bounded local evidence.
- TASK-120 / TASK-121 remain separate DRAFT Class-A gates and are not implementation dependencies
  for this documentation/control-plane task.

## Risks / irreversible actions

- Mislabeling provisional TASK-122 evidence as integrated-main evidence could create a false
  readiness claim.
- Advancing PA-M0 without Human review would bypass the intended product validation gate.
- Rewriting historical DONE rows with new skills would distort historical execution evidence;
  allocations therefore focus on active/future work and milestone routing.
- No irreversible action is authorized by this task.

## Expected files / boundaries

- `tasks/active/TASK-124-prealpha-review-milestone-transition.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`
- `scripts/project-roadmap.mjs` only as needed to keep the canonical roadmap parser/generator
  backward-compatible with project-local skills and namespaced `PA-M*` milestones
- `scripts/project-portfolio-local.mjs` only as needed to support durable root-`main` control
  handback after an authorized TASK-124 history integration

Do not edit application/runtime/database source files.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
