# PokeNexus — Approval Gates

## Class A — Architectural / high-impact

Examples:
- new service/runtime;
- database strategy;
- public protocol semantics;
- realtime topology;
- auth/security model;
- irreversible/destructive migration;
- player-to-player economy/trading rules.

Required:
1. ChatGPT prepares recommendation/spec/ADR.
2. Claude may provide technical feasibility feedback.
3. Codex QA reviews implementation impact when applicable.
4. Gemini audit is required for security, concurrency, economy/trading, or destructive migration risk.
5. Human Owner approves the decision before implementation/merge.

## Class B — Normal feature

Examples:
- feature inside accepted architecture;
- endpoint inside an approved contract;
- game-core implementation of approved rules;
- UI implementation.

Required:
1. READY task.
2. One implementation owner.
3. Automated checks.
4. Codex QA.
5. ChatGPT functional acceptance when user-visible or cross-package.
6. Human Owner may override/require direct review.

## Class C — Mechanical / low risk

Examples:
- fixtures;
- explicit test matrix;
- formatting;
- mechanical refactor;
- narrow script;
- documentation correction with no semantic change.

Required:
1. Scoped task.
2. Validation.
3. Reviewer when production behavior can be affected.

Human Owner approval is not required for each Class C task unless requested.
