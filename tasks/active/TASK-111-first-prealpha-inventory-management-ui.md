# TASK-111 ? First Pre-alpha Inventory Management UI

## Metadata

- State: DRAFT
- Readiness note: first-Pre-alpha Inventory browsing is required by approved SPEC-020/016, but frontend implementation is not authorized by the current TASK-107/108 runtime authorization
- Class: B ? implement the accepted read/management Inventory surface without gameplay/item-use authority
- Owner: Frontend Developer
- Owner execution surface: ChatGPT delegated frontend implementation worker
- Reviewer: independent QA Reviewer (React behavior, accessibility, stale/reload handling and responsive Inventory UX)
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A ? frontend-only read/management surface; no persistence/security/gameplay mutation authority
- Auditor execution surface: N/A
- Consultants: N/A ? Inventory browsing semantics are already accepted; new item-use/economy behavior must escalate
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-011/016/020
- Related: TASK-022/024/025/027/031/100/106
- Branch: not created
- Worktree: not created

## Objective

Implement the required first-Pre-alpha `/inventory` management surface using authoritative Player State/Inventory reads, so the Player can inspect owned quantities and item information without creating any client-side consume, grant, use, Potion, Revive or capture authority.

## In scope

- Bounded authoritative Inventory pagination/read using the accepted self-scoped Player State API.
- Owned quantity, canonical item identity and accepted item/catalog information presentation.
- Reload, reconnect, concurrent-change and stale/error reconciliation through authoritative refresh.
- Responsive and keyboard-accessible browsing consistent with TASK-027/031.
- Clear differentiation between inventory state and Hunt automation policies; policy editing remains TASK-039-owned.

## Out of scope

- Any client-side consume/grant/use action.
- Potion/Revive/capture execution or Hunt policy editing.
- Backend/API/persistence changes.
- Shop, equipment, TM use, trading or new economy systems.
- TASK-100 Collection/Pok?mon/Team/Move-loadout ownership.

## Acceptance criteria

- [ ] `/inventory` renders bounded owned quantities/item information from authoritative reads and survives reload/reconnect.
- [ ] Concurrent server-side Inventory changes reconcile by authoritative refresh; local arithmetic never becomes source of truth.
- [ ] No Inventory UI path can consume, grant or use an item, trigger Potion/Revive, or initiate capture.
- [ ] Empty/loading/error/stale states are explicit and keyboard accessible.
- [ ] Supported small widths have no root horizontal overflow and applicable targets meet the existing accessibility baseline.
- [ ] Independent QA reports no unresolved P0/P1; Class-B acceptance and Human live UI validation complete after implementation.

## Required validation

- React behavior tests for paging, empty/loading/error and concurrent refresh.
- Negative tests proving no consume/grant/use mutation path exists.
- Accessibility/keyboard/focus and responsive checks.
- Relevant web lint/typecheck/test/build.

## Dependencies

- TASK-025 Player State API and TASK-027 shell/navigation.
- TASK-024 authoritative Inventory persistence.
- APPROVED SPEC-016 as forward-amended by SPEC-020.
- TASK-106 Class-A realignment acceptance.

## Risks / irreversible actions

- Client caching must never become Inventory authority.
- Adding item-use controls here would conflict with the accepted management-first contract and must escalate.
- No deploy, public enablement or Git-history action is authorized by this DRAFT task.

## Readiness / execution gate

Promotion to READY requires explicit frontend implementation authorization and confirmed independent QA assignment. Until then this task remains planning only.
