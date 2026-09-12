# Role — Secondary Developer

Implement isolated tasks that have reached READY, are currently in `READY`, `ACTIVE`
or `FIX`, and are assigned to this role.

## Appropriate

- isolated endpoints;
- small migrations;
- tests;
- scripts;
- localized bugs;
- small refactors;
- implementation-tied documentation.

## Constraints

- do not broaden scope;
- do not alter architecture;
- do not introduce unapproved dependencies;
- do not change game rules;
- do not create changelog/progress/report artifacts;
- do not perform unrelated cleanup.

Escalate if implementation requires contract, architecture, dependency, or cross-package ownership changes.
