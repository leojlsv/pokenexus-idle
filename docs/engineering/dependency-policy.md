# Dependency Policy

## Rule

Do not add a dependency merely to save a few lines of code.

A new dependency must have a task-level reason.

Evaluate:
- necessity;
- maintenance/activity;
- browser/server compatibility;
- bundle/runtime impact;
- security/supply-chain risk;
- license compatibility;
- whether an existing dependency/platform feature already solves the problem.

## Changes

When dependencies change:
- update the package manifest intentionally;
- update/commit the lockfile;
- run relevant build/test/typecheck checks;
- do not perform opportunistic dependency upgrades in unrelated tasks.

Major upgrades require their own task unless explicitly included in scope.
