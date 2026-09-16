# TASK-003 — Project Control Roadmap

## Metadata

- State: DONE
- Class: B
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT repository tools
- Reviewer: QA Reviewer
- Reviewer execution surface: ChatGPT worker (independent)
- Auditor: N/A
- Auditor execution surface: N/A
- Spec: N/A — this task creates the canonical project-control artifact
- ADR:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-002-solo-hunts.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
- Branch: `fix/TASK-003-roadmap-lint-node-globals`
- Worktree: `.worktrees/TASK-003-roadmap-lint-node-globals`

## Objective

Create a complete, sequential project-control model for PokeNexus Idle using Epic → Story → Task → Sub-task hierarchy, with current progress, dependencies, canonical roles, execution agents, curated agent skills, quality gates and explicit Human Owner validation points.

Produce exactly two canonical user-facing artifacts:

- `docs/project/PROJECT_ROADMAP.md` — source of truth for project progress and execution planning;
- `docs/project/PROJECT_ROADMAP.html` — user-friendly derived dashboard for human progress review.

## Context

TASK-000, TASK-001 and TASK-002 were complete when this task started. The project had governance, a TypeScript monorepo foundation and the current Cloudflare runtime baseline, but no canonical end-to-end product roadmap.

The Human Owner requires full visibility into what is complete, what is current, what comes next, which role/agent/skill acts at each stage, and where human validation is mandatory.

The roadmap must extend existing governance rather than redefine it. `AGENTS.md` and `docs/agents/**` remain authoritative for role authority and approval gates.

On 2026-09-16 the Human Owner requested correction of the pre-existing root ESLint failures in
`scripts/project-roadmap.mjs`. The script is an explicit Node.js `.mjs` tool, but the flat ESLint config
did not declare Node globals for repository scripts, causing `no-undef` false positives for `Buffer`,
`console` and `process`. This corrective cycle reopens TASK-003 in `FIX` without changing roadmap/runtime
semantics.

## Scope

- define hierarchy semantics for Epic, Story, Task and Sub-task;
- map completed TASK-000/001/002 into the hierarchy;
- define the complete planned development sequence from foundation through release/live operations;
- make the shared deterministic Combat Engine a central architectural milestone reused by PvE Hunts, PvP, Gyms/Challenges, World Boss and future battle content;
- identify dependencies and safe parallelization points;
- map canonical roles to execution surfaces/agents;
- curate relevant external skills discovered from `skills.sh` and `skillsmp.com` without installing them;
- define a skill-adoption safety policy;
- mark every mandatory Human Owner validation gate;
- define roadmap progress/status update rules;
- create a readable standalone HTML dashboard derived from the Markdown roadmap.
- provide deterministic local generation/check tooling so the HTML cannot silently drift from the Markdown source.
- make the repository ESLint environment accurately model Node.js globals for `scripts/**/*.mjs`
  without weakening lint rules for browser/Worker/application code.

## Out of scope

- installing third-party skills;
- changing canonical role authority or approval gates;
- implementing gameplay, UI, persistence, authentication or realtime features;
- changing accepted architecture/ADRs;
- creating commits, pushes or merges without separate Human Owner authorization;
- treating planned task IDs as implementation authorization before each task reaches READY.
- changing roadmap generation behavior, application/runtime code or package dependencies as part of this
  lint-environment correction.

## Acceptance criteria

- [x] Markdown clearly declares itself the project progress/planning source of truth while deferring governance authority to `AGENTS.md`/`docs/agents/**`.
- [x] Epic → Story → Task → Sub-task semantics are explicit and compatible with one-task/one-owner governance.
- [x] TASK-000, TASK-001 and TASK-002 appear as DONE and current position is unambiguous.
- [x] Roadmap covers core domain, universal Combat Engine, data, persistence/auth, player systems, Solo Hunt, UI/rendering, HUB, Duo, PvP, Gyms/Challenges, World Boss, economy/social extensions, security/anti-cheat, observability/admin/live operations and release readiness.
- [x] Combat Engine is explicitly the single shared combat-resolution foundation for all battle-capable content.
- [x] Every planned Task has default owner role, execution surface/agent, reviewer/auditor expectation, skill set and human-validation requirement.
- [x] Human Owner is the final validator for Class A decisions and all designated human/product/live validation gates.
- [x] External skills are sourced from skills.sh or SkillsMP, with source links and adoption status.
- [x] Skills with material audit warnings/failures are not silently recommended for installation.
- [x] HTML provides progress summary, status legend, role/agent/skill visibility, filters and sequential expandable roadmap structure.
- [x] HTML clearly states it is a derived view and Markdown is canonical.
- [x] HTML generation is deterministic, embeds the Markdown SHA-256, and `roadmap:check` fails when the derived HTML is stale or roadmap invariants are violated.
- [x] Dashboard exposes next action, Human Gate Queue, milestone/critical-path context, owner filtering and navigable Task dependencies without external JS/CSS.
- [x] No production code or governance authority is changed.
- [x] `git diff --check` passes.
- [x] Independent QA reviews both artifacts for consistency and scope.
- [x] Human Owner performs final acceptance because the PM / Architecture Coordinator authored the artifacts.

### Corrective maintenance cycle — Node script lint environment

- [x] `scripts/**/*.mjs` receives a narrowly scoped ESLint Node-global declaration.
- [x] No application, Worker or browser source gains Node globals implicitly.
- [x] No dependency or lockfile change is introduced.
- [x] `corepack pnpm lint` passes with zero errors.
- [x] `corepack pnpm roadmap:check` and `git diff --check` pass.
- [x] Independent QA confirms the fix is scoped and does not weaken unrelated lint coverage.

Corrective-cycle QA on 2026-09-16: P0/P1/P2/P3 = 0/0/0/0 — READY to close the cycle.

## Validation / tests

- validate roadmap IDs and status counts;
- validate every Task has owner/agent/skills/human gate metadata;
- validate completed task state against `tasks/done/`;
- validate HTML contains all Epic IDs and can be parsed as HTML;
- validate no accidental external script/runtime dependency is required by the HTML;
- validate deterministic Markdown → HTML generation and source SHA-256;
- validate task dependency references and dependency cycles;
- run `git diff --check`;
- independent read-only QA review.
- run `corepack pnpm lint` and prove the previous seven `no-undef` findings are eliminated without
  disabling `no-undef` or globally declaring Node for non-script code;
- run `corepack pnpm roadmap:check` after lifecycle/roadmap updates.

## Dependencies

- TASK-000 — Agent Governance Baseline: DONE.
- TASK-001 — Project Foundation: DONE.
- TASK-002 — Cloudflare Runtime Modernization: DONE.

## Risks / irreversible actions

- Over-specifying future tasks can create false certainty. Future tasks therefore remain PLANNED/DRAFT until their prerequisites and Human Owner decisions make them READY.
- Third-party skills can contain unsafe instructions. Discovery does not equal installation; every skill requires source/audit review before adoption.
- No irreversible actions are authorized by this task.

## Expected files / boundaries

```text
tasks/done/TASK-003-project-control-roadmap.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
scripts/project-roadmap.mjs
package.json
eslint.config.js
```

`PROJECT_ROADMAP.md` and `PROJECT_ROADMAP.html` remain the only canonical user-facing artifacts. The script and package commands are supporting project-control tooling only. No production/runtime package may change.

## Completion

The original TASK-003 baseline completed after independent QA and explicit Human Owner acceptance on
2026-09-14. The 2026-09-16 corrective cycle passed independent QA with P0/P1/P2/P3 = 0/0/0/0; the Human
Owner then authorized repository completion/history. TASK-003 is `DONE` again. The correction changes no
roadmap/runtime semantics and introduces no dependency.
Use `docs/agents/handoff-protocol.md`.
Do not create additional progress/status/changelog artifacts.
