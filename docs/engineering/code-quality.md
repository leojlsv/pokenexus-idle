# Code Quality Policy

## General

- Prefer simple, explicit code over speculative abstractions.
- Keep changes scoped to the active task.
- Follow existing patterns before introducing new ones.
- Keep module/package boundaries explicit.
- Favor composition and pure functions where they improve clarity/testability.

## TypeScript

- `strict` remains enabled.
- Avoid `any`; exceptions require task-level justification.
- Avoid `@ts-ignore` / `@ts-expect-error` unless the reason is documented and tested.
- Avoid unsafe non-null assertions when normal narrowing/validation is possible.
- Validate untrusted data at boundaries.

## Domain logic

- `game-core` remains deterministic.
- Inject RNG/seed and time/clock where behavior depends on them.
- Domain constants/rules belong in explicit configuration/data, not unexplained magic numbers.
- Server decides durable rewards, progression and economy mutations.

## Error handling

- Never silently swallow errors.
- Errors must be handled, propagated, or converted intentionally.
- Do not use broad fallback behavior that hides defects unless the spec requires it.

## Code hygiene

- No commented-out code.
- No dead code left by refactors.
- No production debug logs.
- No temporary compatibility layers without a removal task.
- TODO/FIXME requires a task reference: `TODO(TASK-123): ...`.
- Comments explain non-obvious reasoning/invariants, not line-by-line behavior or change history.

## Tests

- Test behavior, not implementation trivia.
- Include failure/edge cases from acceptance criteria.
- Deterministic domain tests use fixed inputs/seeds.
- Never weaken assertions to make broken code pass.
- Fix implementation before changing a correct test expectation.
