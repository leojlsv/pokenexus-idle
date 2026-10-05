# SPEC-018 — Current published Hunt catalog release delivery

**Status:** Owner-approved Gate A direction (2026-09-29); API/Card source implemented and independently reviewed without identified P0/P1, production publication and Human conformance pending.

**Scope:** Read-only delivery of the exact current **new-operation** Zone/Hunt publication for the Card Start selector. SPEC-002 owns immutable content and hash semantics; SPEC-015 still owns Start eligibility and mutation. This delivery does not publish Player-specific Zone eligibility or change the selected gameplay release.

## Authority and release selection

The API selects the same `{ gameDataVersion, rulesVersion }` pair used by `HuntRuntimeAuthorityPort.resolveStartSelector`. The selected pair, rules release and game-data release must all be allowed for **new** operations, and a production combat catalog matching that pair must resolve. The expected `bundleHash` is obtained from the independently compiled and verified production catalog identity, never derived from an untrusted fetched manifest. There is no client-selected version, deploy-supplied unchecked digest, or latest-version fallback.

The server reads the immutable publication from its configured game-data delivery reader and requires an explicitly supported PvE publication envelope. The original accepted transport used schema v4; the later Human-approved schema-5 cutover plus completed TASK-115 runtime-delivery enablement add schema v5 as a compatible runtime envelope while preserving the three schema-v4 PvE artifacts byte-identically. This transport therefore accepts only schema v4 or schema v5, rejects schema v3 and unknown future schemas, verifies the canonical manifest's `bundleHash` against the independent production pin and checks the exact `catalogs/zones` and `catalogs/hunts` shard digests and canonical schema. All option identities and labels come from those shards. The number of each type is bounded to at most 512; duplicate IDs, missing zone joins, invalid display facts, excessive bytes, missing required manifest metadata or partial/corrupt required data fail closed. This selector transport intentionally fetches **only** those three required files; schema-5 support does not widen that allowlist or authorize Encounter-preview artifacts. It verifies the published manifest's provenance references and independent bundle commitment but does not download the multi-megabyte provenance or source-inventory audit blobs or claim to prove their separate physical availability. The canonical publishing pipeline remains responsible for their retention.

The API-controlled, same-origin read surface is the approved immutable *artifact origin* for this Card flow. It proxies only the three verified bytes necessary for the selector. No browser-side R2/CDN configuration or authority over the Player is introduced. TASK-032 still owns the separate general-purpose asset distribution pipeline.

## HTTP read contract

All routes below require an authenticated self-scoped Player session without touching session activity. None accepts a Player ID, CSRF token, mutation key, cookie-dependent selector, arbitrary URL, or file path from the client. Responses use `Content-Type: application/json; charset=UTF-8` and `Cache-Control: private, no-store`. An unavailable release returns `503 {"error":"authority_unavailable"}`; missing/invalid requested asset identity returns `404 {"error":"not_found"}`. Authentication follows SPEC-011/ADR-006 (`401` for missing/expired session, `404` for an authenticated account with no Player). Unhandled server faults remain generic, with no release credentials or private evidence in errors.

`GET /player/hunts/catalog-release` returns the exact three-field object:

```json
{
  "gameDataVersion": "game-data-core-kanto-johto-v3",
  "bundleHash": "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559",
  "artifactBasePath": "/player/hunts/catalog-artifacts/"
}
```

These version and hash values are illustrative of the existing v3 publication; production must return only its **currently selected** verified release. The base path is a fixed same-origin API path and cannot be replaced by a remote origin or an arbitrary redirect.

`GET /player/hunts/catalog-artifacts/:versionDirectory/manifest.json`, `/catalogs/zones.json` and `/catalogs/hunts.json` serve only verified canonical bytes from that precise publication. `versionDirectory` must equal SPEC-002's `version-${SHA-256(NFC(gameDataVersion))}` for the server's current descriptor, and each artifact must be from its fixed allowlist. The server never maps a guessed path to a different publication. A release change between descriptor read and artifact fetch must make the old read fail; it may not substitute the new release into the old path. A retry begins again with a new descriptor GET.

The server enforces response-byte budgets (manifest at most 64 KiB; each display shard at most 1 MiB) and row-count budgets before returning any artifact. The browser independently enforces 4 KiB on the descriptor and catalog HTTP error bodies, and 1 MiB per successful artifact response while streaming. It validates the supported schema-v4/v5 manifest, bundle hash from the descriptor, shard hash, canonical JSON, row counts, duplicate identities and referential integrity with the existing `@pokenexus/game-data/runtime` reader. Redirects are rejected for every catalog request, including the descriptor, rather than following arbitrary URLs. If any one read fails, the client passes `catalog=null`; it never uses partial or previously verified options for a **new** Start. Existing frozen Start commands retain their original key and intent independently of catalog loading.

## Consistency, safety and acceptance

The release descriptor represents **publication**, not Player admission. `POST /player/hunts/start` re-resolves the current server release, pending retained selection, saved Team, recovery and Player eligibility under SPEC-015. A valid selector can become ineligible between GET and POST; the client handles that server rejection without choosing another Hunt, silently retrying or changing the frozen command key. An already rendered choice may retain older display text until the Player refreshes publication. If a new release reuses the same HuntDefinitionId with changed content, the current Start contract accepts that ID against the **new** release; this v1 read is not a guarantee that the displayed release and eventual Start execute with identical content. Exact preview-version binding would require its own accepted Start protocol change. Rollbacks and deployment switches must update the server-side new-operation authority atomically with its compiled release pin and immutable artifact availability; otherwise publication reads return 503 and Start remains server-guarded.

Validation requires a real current schema-v5 publication roundtrip plus historical schema-v4 compatibility; expired session and missing Player; unknown/retired release; wrong compiled hash; schema-v3 and unknown-future manifests; corrupt/missing/truncated/oversized shards; duplicate/orphan options; rollback between requests; and client reload, abort and no-POST on catalog failure. A production route/deployment check must confirm that the configured origin actually serves the selected immutable bytes. Local repository content alone is not deployment proof.

**Privacy:** No wild HP/Genetics or Player-owned state is part of these artifacts. The server's authenticated wrapper is independent of the Player's progress; it does not expose per-Player unlocks, entitlement or mutation effects.
