# TASK-099 — Pokémon Sprite Generation Lab

## Metadata

- State: FIX
- Class: C
- Owner: SD
- Owner execution surface: Codex
- Reviewer: QA
- Reviewer execution surface: fresh Codex read-only review
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: N/A
- ADR: N/A
- Branch: `chore/TASK-099-pokemon-sprite-generation-lab`
- Worktree: `G:\pokenexus-idle\.worktrees\TASK-099-pokemon-sprite-generation-lab`

## Objective

Evaluate a reproducible lab pipeline that starts from one accepted Pokémon sprite and generates the movement poses needed by an overworld spritesheet, using the Aerun overworld sheet only as pose/layout reference while preserving the source sprite's visual identity.

The Human Owner approved continuing this as a non-blocking parallel R&D task on 2026-09-27. After reviewing the first SpriteCook pass, the Human Owner explicitly corrected the requirement: the Aerun reference must govern the actual movement positions, not only four static facing directions. The active rework therefore targets the full 4x4 locomotion pose contract before Human validation.

## Context

The Human Owner supplied:

- `G:\Charizard.png` as the visual identity/style source;
- `G:\All 721 Pokemon Overworlds by Aerun.zip` as the movement-pose/layout reference;
- `https://github.com/0x0funky/agent-sprite-forge` for evaluation as a possible supporting skill/pipeline.

This is an isolated asset-generation experiment for future EPIC-04/TASK-032 work. It does not establish a production asset contract.

## Scope

- inspect the supplied Charizard sprite and Aerun Charizard overworld sheet;
- identify frame grid, direction ordering, pose structure, anchors and output dimensions;
- evaluate `agent-sprite-forge` against this reference-transfer use case;
- reuse only the parts that materially improve deterministic cleanup, alignment, extraction or QC;
- create an isolated lab under `tools/sprite-lab/`;
- generate a Charizard proof of concept and visual/QC artifacts;
- document the exact reproducible command and measurable acceptance signals in this task.
- use SpriteCook as the creative identity-preserving generation surface for the movement-pose rework;
- import the authoritative source once and reuse its stable SpriteCook asset identifier;
- reproduce the Aerun 4x4 movement structure: rows down/left/right/up and four movement phases per row;
- treat every Aerun cell as pose/occupancy/root authority only; generated pixels must continue to derive visual identity solely from the authoritative source;
- assemble and review the complete 16-frame locomotion atlas before the Human visual gate;
- retain agent-sprite-forge concepts for anchors, scale discipline, frame structure and QC rather than as the primary creative generator.

## Out of scope

- runtime/game integration;
- production asset manifest/CDN wiring;
- bulk generation for the Pokédex;
- changing combat, Hunt, persistence or canonical data contracts;
- treating Aerun artwork as the target visual style;
- accepting outputs with distorted anatomy, pose drift or arbitrary redesign.
- accepting a four-static-facing substitute for the required movement phases;
- bulk generation for additional species before both Charizard and a second-morphology PoC pass.

## Acceptance criteria

- [x] Input copies are isolated from the Human Owner's originals.
- [x] The Aerun Charizard reference is decomposed into an explicit frame/pose contract.
- [x] The lab distinguishes pose/layout authority from visual-identity authority.
- [ ] The PoC keeps Charizard's recognizable silhouette, palette relationships, shading language and major identity markers across generated frames.
- [ ] Direction/pose order follows the Aerun reference contract.
- [ ] Output frames share a stable anchor and consistent standing-equivalent scale.
- [ ] The result includes a review sheet/GIF or equivalent visual artifact.
- [x] The evaluation states whether `agent-sprite-forge` should be adopted whole, partially reused, or rejected for this pipeline.

## Validation / tests

- [x] inspect source and reference images visually;
- [x] record source/reference dimensions, alpha/palette characteristics and frame geometry;
- [x] run deterministic structural/QC checks for frame count, frame size, alpha bounds, anchor drift and scale drift;
- [ ] visually review the final PoC for identity, anatomy, shading and pose fidelity.

## Dependencies

- Human-provided local assets listed above.
- `agent-sprite-forge` public repository evaluation.
- SpriteCook MCP configured in the Codex execution surface.

## Risks / irreversible actions

- None. All generated work stays in the task worktree and the Human Owner's source files remain untouched.

## Supporting assignments

- PM / Architecture Coordinator: ChatGPT prime session — scope, orchestration and Human gate coordination.
- PP / Asset Tooling Specialist: advisory only — SpriteCook reference/edit semantics, asset-id workflow and generation settings.
- PP / Pixel-QC Specialist: advisory only — Aerun pose contract, pixel-safe geometry, anchor/scale/edge checks.
- Human Owner: visual identity and movement-pose acceptance after the complete 4x4 locomotion PoC.

## Prior rejected evidence

- The earlier agent-sprite-forge/built-in-image-generation route was moderation-blocked during a canonical Codex run.
- A fallback raw processed through the official generate2dsprite.py path failed structural QC and visual-identity review. Those artifacts remain ignored diagnostic evidence only and are not accepted project assets.

## Current QA gate

- Independent QA verdict: FAIL.
- P1: generated down/right/up keyframes drift from the authoritative source in identity, anatomy and rendering language.
- P1: generated keyframes return at 100x100 with incompatible subject scale and no established common anatomical root against the retained 60x56 source.
- P2: exact per-job prompts/receipts/canonical download references are not yet retained for full remote reproduction evidence.
- P2: current metrics measure occupancy bounds rather than explicit anatomical foot/root coordinates.
- The first four-static-facing strategy is superseded by Human direction: rework must validate the full Aerun movement-phase contract, not merely directional facings.

## Expected files / boundaries

- `tasks/active/TASK-099-pokemon-sprite-generation-lab.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/project/PROJECT_ROADMAP.html`
- `tools/sprite-lab/**`
- generated/local input material under ignored `tools/sprite-lab/.work/**`

## Evaluation

`agent-sprite-forge` is useful as a partial reference, not as the complete pipeline. Reuse the dual-reference prompt discipline, deterministic split/export structure, anchor concepts and structural QC. The lab owns pose-conditioned redraw, pixel-safe nearest-neighbor processing, palette locking and visual identity/anatomy/shading gates. The external processor's LANCZOS resize path is not used.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
