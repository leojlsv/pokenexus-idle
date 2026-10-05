# SPEC-024 — Hunt Pre-Start Encounter Preview Delivery

- Status: DRAFT Class-A — not implementation authority
- Owner: Human Owner
- Coordinator: ChatGPT
- Related ADRs: ADR-006
- Related tasks: TASK-034, TASK-039, TASK-118, TASK-119

## Problem

The first-Pre-alpha Hunt Start screen must show possible Species and reward preview from authoritative published content. APPROVED SPEC-018 intentionally exposes only the current manifest plus Zone/Hunt artifacts, so it does not authorize Encounter-definition disclosure. TASK-039 therefore correctly fails closed today.

## Goals

- Define the smallest authoritative public preview needed by the Start UI.
- Bind preview to an explicit immutable game-data release without client-selected authority.
- Preserve server authority over actual Encounter selection, admission and mutation.
- Minimize information disclosure while allowing useful Species/reward preview.

## Non-goals

- Predict a concrete next Encounter, RNG draw, capture result, Shiny/Genetics or Battle state.
- Publish hidden wild HP, server secrets or Player-specific eligibility.
- Change economy/content probabilities.
- Implement endpoints before this Class-A draft is accepted.

## Required behavior

- Preview data MUST originate from a server-selected/pinned published game-data release and fail closed on missing/tampered authority.
- The player-facing read MUST use the authenticated self-scoped session boundary under ADR-006/SPEC-011, accept no Player ID from the client, and must not be interpreted as anonymous internet publication. A future general-purpose public asset surface would require its own accepted authority.
- The public shape MUST contain only facts required to render possible Species and reward preview for the selected Hunt.
- Preview MUST NOT expose per-Encounter individualization, RNG state/draws, Genetics/Shiny outcome, hidden HP, capture-roll evidence or server-only provenance secrets.
- Start remains server-authoritative and revalidates admission/content under the accepted Start contract unless an explicit amendment later binds Start to an exact preview release.
- The client MUST NOT fall back to hard-coded/local content when preview authority is unavailable.
- Rollback/release-switch behavior MUST be explicit; a stale preview may not silently map to a different release.

## Edge cases

- Release changes after selector/preview read but before Start.
- HuntDefinitionId reused with changed content in a later release.
- Missing/oversized/corrupt preview artifact/projection.
- Encounter definitions containing facts that are valid internally but excessive for public disclosure.
- Reward preview whose exact grant still depends on runtime/Encounter resolution.

## Acceptance

- Independent contract QA confirms the shape is sufficient for TASK-039 without local authority.
- Security/privacy review confirms disclosure is bounded to intended preview facts.
- SPEC-018 relationship is explicit: this spec is additive authority, not an implied interpretation of SPEC-018.
- Start release-binding semantics are explicitly selected by the Human Owner.

## Open decisions

1. Transport shape: allowlisted immutable `catalogs/encounter-definitions` bytes vs a smaller server-produced projection.
2. Exact public fields for Species probability/range and reward preview.
3. Whether preview uses SPEC-018's descriptor/artifact base or a distinct versioned endpoint.
4. Whether Start remains current-authority revalidation only or gains exact preview-release binding.
5. Response size/count budgets and retention/cache behavior.
