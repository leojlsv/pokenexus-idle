# TASK-005 — Core Domain Type Skeleton

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: DEFAULT
- Reviewer: QA Reviewer
- Reviewer execution surface: DEFAULT
- Auditor: N/A
- Auditor execution surface: N/A
- Spec: `docs/specs/SPEC-001-core-domain-model.md`
- ADR:
  - `docs/decisions/ADR-001-runtime-and-language.md`
- Branch: `feat/TASK-005-core-domain-type-skeleton`
- Worktree: `.worktrees/TASK-005-core-domain-type-skeleton`

## Objective

Implement the minimum infrastructure-free TypeScript type skeleton required to make the
approved `SPEC-001` domain vocabulary usable by later packages without introducing game
rules, static-data schemas, persistence shapes or transport contracts.

The task establishes compile-time separation for canonical domain identifiers and the
approved six-stat vocabulary inside `@pokenexus/game-types`.

## Context

TASK-004 is DONE and `SPEC-001` is APPROVED. The current `packages/game-types` entrypoint
is still a foundation placeholder and intentionally contains no real domain types.

`SPEC-001` explicitly assigns the concrete TypeScript representation of canonical IDs to
TASK-005. Later tasks depend on these identifiers being difficult to mix accidentally,
while keeping the package free of runtime, persistence, HTTP, database, React or
Cloudflare concerns.

The task must remain a skeleton. Where `SPEC-001` deliberately defers a concept, TASK-005
must not invent a concrete schema merely to make the type package look more complete.

## Scope

### Canonical identifiers

- export distinct TypeScript types for every canonical ID defined by `SPEC-001`:
  - `SpeciesId`;
  - `PokemonInstanceId`;
  - `CombatantId`;
  - `MoveId`;
  - `TypeId`;
  - `AbilityId`;
  - `ItemId`;
  - `EffectId`;
  - `TeamId`;
  - `PlayerId`;
  - `EncounterDefinitionId`;
  - `EncounterId`;
  - `BattleId`;
  - `ZoneId`;
- use one lightweight primitive-backed nominal/opaque TypeScript representation so IDs
  remain simple to serialize later but are not freely interchangeable at compile time;
- keep branding/nominality zero-runtime or effectively zero-runtime: no ID classes,
  registries, UUID library, parser framework or dependency is required by this task;
- do not add general-purpose constructors/validators that would pretend arbitrary
  external strings have already passed a future boundary-validation policy.

### Canonical stat vocabulary

- export `StatKey` containing exactly the six approved keys:
  `hp | atk | def | spa | spd | spe`;
- export a generic `StatBlock<TValue>` structural type in which all six canonical stat
  keys are required and none of the canonical keys are optional;
- if a partial-stat helper is required by the implementation/tests, give it an explicit
  partial name rather than weakening `StatBlock` itself;
- do not assign numeric ranges, formulas, rounding, Speed semantics, IV rules or balance
  meaning to the stat structure.

### Type-safety guards

- add compile-time/type-level guards proving representative canonical ID kinds are not
  assignable to one another;
- guard the exact `StatKey` vocabulary and required-key behavior of `StatBlock`;
- keep runtime tests only where they test an actual runtime export retained by this
  package; do not manufacture runtime code solely so type-only contracts can be tested.

### Package boundary

- keep all domain skeleton types in `packages/game-types`;
- preserve the package as infrastructure-free shared TypeScript;
- expose the accepted types through the package public entrypoint;
- follow the smallest coherent file organization; splitting modules is allowed only when
  it improves clarity without creating speculative abstraction.

## Out of scope

- species/form, Move, Type, Ability, Item, Zone or Encounter Definition schemas;
- `rulesVersion`, `gameDataVersion`, checksums, provenance or versioned-definition
  reference shapes owned by TASK-006;
- PokémonDB ingestion/crawler work;
- combat state, combat snapshots, battle sides, effects/status algebra or Combat Engine
  input/event contracts owned by TASK-007/008;
- IV numeric domains, derived-stat formulas, damage/accuracy/crit/timing/Speed semantics;
- Move Loadout ordering/cardinality/duplicate rules;
- Pokémon Team ordering/cardinality/slot/mutation rules;
- Ability selection/eligibility rules for owned Pokémon;
- inventory/item ownership or stack/quantity semantics;
- PvE World/Map topology, Hunt lifecycle or content data;
- persistence/database representation;
- HTTP/WebSocket/public protocol serialization;
- application/UI changes;
- new dependencies;
- broad refactors of other shared packages.

## Acceptance criteria

- [x] All 14 canonical IDs from `SPEC-001` are exported by `@pokenexus/game-types`.
- [x] Canonical ID types are nominally/opaquely distinct enough that representative IDs
      cannot be assigned across identity kinds without an explicit unsafe assertion.
- [x] The ID representation adds no runtime class hierarchy, registry or external
      dependency.
- [x] `StatKey` contains exactly `hp`, `atk`, `def`, `spa`, `spd`, `spe`.
- [x] `StatBlock<TValue>` requires every canonical stat key and does not make any of them
      optional.
- [x] Type/compiler guards cover ID separation, invalid stat keys and incomplete stat
      blocks without weakening production types.
- [x] No static game-data schema, combat rule, persistence shape, protocol payload or
      product/gameplay behavior is introduced.
- [x] No deferred decision from `SPEC-001` is silently resolved by this implementation.
- [x] `@pokenexus/game-types` remains infrastructure-free and has no new dependency.
- [x] Existing package/workspace behavior outside the declared scope remains unchanged.
- [x] Relevant lint, typecheck, tests and build pass.
- [x] `git diff --check` passes.
- [x] Independent QA reports no unresolved P0/P1 findings.

## Implementation evidence

- `corepack pnpm --filter @pokenexus/game-types lint` — passed.
- `corepack pnpm --filter @pokenexus/game-types typecheck` — passed.
- `corepack pnpm --filter @pokenexus/game-types test` — passed (1 runtime test; type-safety
  guards are compiler assertions in the same test source).
- `corepack pnpm --filter @pokenexus/game-types build` — passed.
- `corepack pnpm -r typecheck` — passed.
- `corepack pnpm -r test` — passed.
- `corepack pnpm -r build` — passed.
- `corepack pnpm roadmap:check` — passed.
- `git diff --check` — passed.
- Working-tree inspection with `git diff`, `git status --short` and explicit review of the
  untracked active task file confirmed changes are limited to the accepted
  package/task/roadmap boundaries; no Git history was written.
- Independent QA merge-gate re-review on the corrected REVIEW snapshot — P0/P1/P2/P3 all
  zero; READY.
- PM / Architecture Coordinator delegated Class B acceptance — passed; implementation
  matches approved `SPEC-001` and no semantic-drift Human Owner gate was triggered.

## Validation / tests

Run and report exact results for:

```text
corepack pnpm --filter @pokenexus/game-types lint
corepack pnpm --filter @pokenexus/game-types typecheck
corepack pnpm --filter @pokenexus/game-types test
corepack pnpm --filter @pokenexus/game-types build
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:check
git diff --check
```

Inspect the complete task change set against `origin/main`. Before the task is committed,
use `git diff`, `git status --short` and explicit review of any untracked task file; after
a task commit exists, `git diff origin/main...HEAD` may be used. Confirm there is no
change outside the declared task/roadmap and `packages/game-types` boundaries.

## Dependencies

- TASK-004 — Domain Glossary & Core Model Spec: DONE.
- `SPEC-001 — Core Domain Vocabulary & Model`: APPROVED.

## Risks / irreversible actions

- A weak structural alias such as plain `string` for every ID would permit category
  confusion and defeat the identity boundary accepted in `SPEC-001`.
- An over-engineered opaque-ID framework could create unnecessary ergonomics/runtime
  cost; prefer the smallest TypeScript-only nominal mechanism that satisfies the compiler
  guards.
- Adding concrete definition/entity schemas here would pre-empt TASK-006/007/008/019/022
  and is not authorized.
- No destructive, remote or irreversible runtime operation is authorized by this task.
- Commit/push/merge were explicitly authorized by the Human Owner for TASK-005 completion.

## Expected files / boundaries

Expected implementation changes are limited to:

```text
packages/game-types/src/**
tasks/done/TASK-005-core-domain-type-skeleton.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

No package manifest, lockfile, dependency or other production package should need to
change. Any additional file requires a demonstrated TASK-005 need and must remain inside
the accepted package/domain boundary.

## Completion

Completed after implementation validation, independent QA with no P0/P1/P2/P3 findings,
delegated Class B PM acceptance, and explicit Human Owner authorization for repository
completion on 2026-09-14.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
