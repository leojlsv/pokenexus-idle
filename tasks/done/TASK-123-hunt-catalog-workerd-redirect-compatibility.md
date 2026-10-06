# TASK-123 — Hunt Catalog Workerd Redirect Compatibility

## Metadata

- State: DONE
- Class: B
- Owner: Software Developer (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent security/integrity reviewer
- Auditor execution surface: independent ChatGPT delegated reviewer
- Completion evidence: focused catalog regression 8/8 PASS; API typecheck + Worker dry-run PASS; live TASK-122 Workerd diagnostic returned exact accepted v5 bundle; independent QA READY 0/0/0; independent security/integrity READY 0/0/0
- Consultants: N/A
- Consultant execution surface(s): N/A
- Dependencies: TASK-118, TASK-122
- Branch: `fix/TASK-123-hunt-catalog-workerd-redirect`
- Worktree: `.worktrees/TASK-123-hunt-catalog-workerd-redirect`

## Trigger evidence

During TASK-122 local Worker validation on 2026-10-06, the integrated Hunt catalog endpoint returned
`503 authority_unavailable`. The local-only diagnostic exposed the concrete Workerd runtime rejection:
`Request.redirect = "error"` is unsupported by Cloudflare Workers; Workerd accepts `follow` or
`manual`. The existing code never reached the immutable origin fetch.

This is new runtime evidence against completed TASK-118 source and justifies a bounded corrective task.

## Objective

Preserve the accepted no-redirect Hunt catalog security behavior while using a Worker-compatible Fetch API
mode.

## Scope

- Change the bounded Hunt catalog origin fetch from `redirect: "error"` to `redirect: "manual"`.
- Continue rejecting every redirect response before consuming response bytes.
- Add a regression proving the Worker-compatible request option and no redirect following.
- Re-run focused API tests, Worker dry-run, TASK-122 local catalog smoke and relevant project gates.

## Out of scope

- No contract change, new catalog endpoint, new origin policy or expanded artifact allowlist.
- No deploy/public enablement.
- No TASK-120/121, eligible-Moves, production migration or CombatPresentation work.

## Acceptance criteria

- [x] Workerd accepts the request configuration.
- [x] Redirect responses remain fail-closed and are never followed.
- [x] Exact immutable v5 catalog still validates.
- [x] TASK-122 local catalog endpoint becomes available.
- [x] Independent QA and security/integrity reviews find no unresolved P0/P1/P2.
