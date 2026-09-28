# TASK-029 — Card / Low-Spec Combat Renderer Foundation

## Metadata

- State: DONE
- Class: B
- Owner: Frontend Developer
- Owner execution surface: ChatGPT prime
- Reviewer: QA Reviewer
- Reviewer execution surface: independent review
- Auditor: N/A
- Specs:
  - `docs/specs/SPEC-015-authoritative-hunt-api-contract.md`
  - `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- Upstream contract: `TASK-028 — Combat Presentation Event Contract`
- Branch: `feat/TASK-029-card-low-spec-combat-renderer`
- Worktree: `.worktrees/TASK-029-card-low-spec-combat-renderer`
- Base: `2a890fbecdbe276c335bc527561481ab85e0fde6`

## Objective

Implement an accessible DOM/Card combat presentation foundation that consumes the renderer-neutral TASK-028
presentation contract without owning combat rules, Hunt progression, rewards, capture logic or persistence.

## Scope

- consume TASK-028 bootstrap and continuation envelopes directly;
- render player and wild combatants with authoritative active/reserve/KO state;
- expose exact HP only when the contract marks owned HP as `visibility: "exact"`;
- render wild vitality only as semantic `conscious | ko`, with no bar, percentage, ratio, bucket or inferred value;
- maintain a deterministic textual event feed for all TASK-028 event kinds;
- apply only presentation-state transitions explicitly carried by TASK-028 events;
- support low-cost/reduced-motion presentation without animation-dependent information;
- provide pure behavior helpers plus React/Card components suitable for later TASK-039 Hunt integration;
- add engine-produced renderer test segments for KO, forced replacement and effect behavior where exercised;
- keep route/Hunt integration outside this task.

## Out of scope

- combat math, RNG, move resolution, target selection, AI or any gameplay authority;
- Solo Hunt fetching, command submission, offline advancement, capture or rewards;
- exact/public wild HP, maxHP, HP%, proportional vitality or derived hidden-stat inference;
- Pixi/canvas rendering;
- Collection/Pokémon/Team management (TASK-100);
- route replacement or active-Hunt integration (TASK-039);
- commit, merge, push or deploy.

## Acceptance criteria

- [x] Card renderer consumes the TASK-028 presentation contract and no second combat model.
- [x] Initial active/reserve state is taken from bootstrap `initialSides`.
- [x] `CombatantKO` and `CombatantActivated` update presentation state deterministically.
- [x] Owned exact HP is rendered only when supplied explicitly by TASK-028.
- [x] Wild combatants never render numeric/proportional HP or infer it from event history.
- [x] All TASK-028 event kinds have deterministic accessible text-feed representation.
- [x] Effect/status presentation is driven only by explicit `EffectApplied/Updated/Removed` and related events.
- [x] Reduced-motion/low-spec operation preserves all information without required animation.
- [x] Behavior tests cover bootstrap, privacy, KO/replacement/effects and event-feed semantics.
- [x] KO/replacement/effect behavior tests use valid engine-produced event segments where generation is practical.
- [x] Existing shell/protocol/core regression suites remain green.
- [x] Independent QA reports no unresolved P0/P1 before Human live validation.

## Validation / tests

```text
corepack pnpm --filter @pokenexus/web lint
corepack pnpm --filter @pokenexus/web typecheck
corepack pnpm --filter @pokenexus/web test
corepack pnpm --filter @pokenexus/web build
corepack pnpm --filter @pokenexus/game-protocol test
corepack pnpm --filter @pokenexus/game-core test
corepack pnpm roadmap:check
git diff --check
```

Owner validation evidence:

- web focused/full tests: PASS, 7 files / 28 tests including 9 Card renderer tests;
- web typecheck: PASS;
- web lint: PASS;
- web production build: PASS; shell bundle remains unchanged because TASK-029 is not route-integrated before TASK-039;
- game-core regression: PASS, 13 files / 230 source tests;
- game-protocol regression: PASS after building its existing game-core prerequisite, 2 files / 16 source tests;
- engine-produced renderer scenario covers `EffectApplied`, hidden wild-source damage + `CombatantKO`, and
  `CombatantActivated` forced replacement before projection through TASK-028;
- hidden HP consequence invalidates stale owned exact HP in renderer-local state instead of subtracting/inferencing;
- a later explicitly exact owned HP consequence can resynchronize current HP using only the owned maxHP already disclosed
  by bootstrap; no hidden delta reconstruction is used;
- exact `resultingHp: 0` does not derive KO; semantic KO changes only when authoritative `CombatantKO` arrives,
  including across split continuation batches;
- initial participant state/render order follows authoritative `initialSides[].combatantIds`, not incidental
  `initialParticipants` array order;
- rendered event history is capped at 100 latest entries for low-spec operation while the latest-event live announcement
  remains bounded and the historical ordered list remains non-live;
- KO changes semantic vitality to KO without fabricating a numeric HP value;
- no App route/Hunt integration, command authority, Pixi, TASK-100 or gameplay semantics added.

Independent gates:

- QA corrective re-gate: **READY**, P0/P1/P2/P3 = **0/0/0/0**.
  - prior P1 KO inference was removed; only authoritative `CombatantKO` changes semantic KO;
  - prior P1 exact-resync failure was removed; later explicitly exact owned HP can resynchronize after privacy
    invalidation without reconstructing hidden deltas;
  - authoritative `initialSides[].combatantIds` roster order, bounded feed, latest-only live announcement,
    privacy and scope isolation were re-verified.
- Independent Class-B functional/architectural acceptance: **ACCEPT**, P0/P1 = **0/0**, no material P2/P3.
  - renderer is implementable by TASK-039 without gameplay authority or semantic widening;
  - SPEC-015 hidden-information and TASK-028 active/reserve/KO/effect semantics remain intact;
  - production code depends on game-protocol only; game-core remains dev/test fixture generation.

## Dependencies

- TASK-027 — DONE.
- TASK-028 — DONE.

## Risks / irreversible actions

- Reconstructing wild HP from visible events would violate SPEC-015.
- Recomputing HP, status, KO or action outcomes would create client gameplay authority.
- Coupling the foundation directly to Hunt HTTP state would blur TASK-029/TASK-039 ownership.
- No irreversible action is authorized.

## Expected files / boundaries

- `apps/web/src/combat-card*`
- `apps/web/package.json` / `pnpm-lock.yaml` only for required workspace dependency edges
- focused test-only fixture helpers if needed
- this task file
- roadmap Markdown/generated HTML

Do not change game-core combat semantics, Hunt API behavior or accepted TASK-028 privacy rules.

## Human gate

Human Owner approved the available isolated Card visual preview on 2026-09-28. KO/replacement were covered by engine-projected automated tests but not shown in the preview. Full Hunt-integrated live validation remains with TASK-039. Repository/history completion was authorized by the Human Owner on 2026-09-28; push/deploy remain separate gates.
