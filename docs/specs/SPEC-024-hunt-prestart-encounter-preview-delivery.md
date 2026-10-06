# SPEC-024 — Hunt Pre-Start Encounter Preview Delivery

- Status: APPROVED Class-A v1 — Human Owner selected **Option 1: minimal authenticated server projection** and explicitly approved the exact protocol v1 on 2026-10-06; implementation/history integration of this exact contract is authorized, while deploy/public enablement remain separate gates
- Owner: Human Owner
- Coordinator: ChatGPT
- Related ADRs: ADR-006
- Related specs: SPEC-002, SPEC-011, SPEC-015, SPEC-018, SPEC-020, SPEC-021
- Related tasks: TASK-034, TASK-039, TASK-118, TASK-119
- Implementation: feature `3ae9604`, canonical-main merge `490b6de` on 2026-10-06; deploy/public enablement remain separate

## 1. Human decision already made

The Human Owner selected the following Class-A direction on 2026-10-06:

1. the browser receives a **minimal authenticated server-produced projection**, not raw Encounter definitions;
2. the projection contains only **possible Species + limited reward preview** needed by the first-Pre-alpha Start screen;
3. the projection carries the immutable **game-data release identity** from which it was derived;
4. `POST /player/hunts/start` remains unchanged and re-resolves the **current** authoritative Start context under SPEC-015; the preview release is not a Start binding token.

This decision rejects the two previously open alternatives for this contract revision: publishing allowlisted raw Encounter-definition bytes and binding Start to the exact release used by the preview. The Human Owner subsequently gave explicit approval to the complete v1 route, fields, bounds and failure semantics in this document. That approval authorizes implementation, validation and repository-history integration of this exact contract only; it does not authorize deploy/public enablement or any TASK-120/121/eligible-Moves work.

## 2. Problem

The first-Pre-alpha Hunt Start screen must show possible Species and a bounded reward preview from authoritative published content. APPROVED SPEC-018 intentionally exposes only the current manifest plus Zone/Hunt artifacts, so it does not authorize Encounter-definition disclosure. TASK-039 therefore correctly fails closed today.

The pre-v1 client-side projection demonstrated the minimum information the UI needs: a deduplicated Species list plus Player XP, Pokémon XP-pool and item-drop ranges. That old derivation was **not** public authority because it required Encounter definitions that SPEC-018 deliberately keeps server-side. The approved v1 implementation replaces that browser-side derivation with the authenticated server projection defined here.

## 3. Goals

- Define the smallest authenticated read needed by TASK-039 without publishing Encounter definitions.
- Derive every preview fact from the same server-selected immutable publication authority used for new Hunt operations.
- Carry enough release identity for the client to detect a selector/preview mismatch.
- Preserve SPEC-015 Start as the only mutation/admission authority.
- Minimize information disclosure: no Encounter weights, concrete Encounter identities, level bands, RNG state or Player-private data are required.
- Fail closed on missing, corrupt, oversized or mismatched authority without local/hard-coded fallback.

## 4. Non-goals

- Predict a concrete next Encounter, Species probability, encounter weight, RNG draw, capture result, Shiny/Genetics outcome or Battle state.
- Publish Encounter-definition rows, Encounter IDs, level bands, hidden wild HP, capture-roll evidence or server-only provenance secrets.
- Publish Player-specific eligibility, Team admission, Inventory quantities or policy state.
- Bind Start to the preview release or add a preview token to the Start request.
- Change SPEC-018's exact three-field release descriptor or its artifact allowlist.
- Change economy/content probabilities or reward rules.
- Implement an endpoint, mutate frontend source, deploy or publicly enable routes before the complete contract is explicitly accepted.

## 5. Authority and source selection

For every preview read, the server MUST resolve the same current **new-operation** game-data publication authority used by SPEC-018 and by SPEC-015 Start resolution. The client cannot choose `gameDataVersion`, `bundleHash`, release directory, artifact URL or any alternative retained release.

The server MAY read the verified `catalogs/encounter-definitions` artifact internally to derive the projection, but those bytes remain server-side and are not added to SPEC-018's browser artifact allowlist. Before projecting, the server must retain the existing immutable-publication checks: accepted schema, independently pinned bundle identity and canonical artifact/hash validation, then apply the additional SPEC-024 input-work ceilings in section 8 before parsing/projecting. Repository-local data is not production authority.

The projection identifies its immutable content source using the same game-data identity pair already surfaced by SPEC-018:

- `gameDataVersion` — server-selected immutable game-data version;
- `bundleHash` — independently pinned canonical bundle hash, `sha256:<64 lowercase hex>`.

`rulesVersion` is intentionally not part of this preview response: the exposed Species/reward facts are a projection of immutable game-data content, while executable rules/admission remain Start authority. Adding executable-rule identity to this read would require a later accepted amendment.

## 6. Authentication and transport

### 6.1 Candidate route

The candidate v1 read is:

`GET /player/hunts/prestart-preview/:huntDefinitionId`

This is a distinct authenticated read and does not amend the exact payload of `GET /player/hunts/catalog-release`.

### 6.2 Session and ownership boundary

- normal active ADR-006 session required;
- self-scoped Player resolution under SPEC-011/SPEC-015;
- no `accountId`, `playerId`, `ownerPlayerId`, release selector, URL or file path accepted from the client;
- `huntDefinitionId` is a content selector only, never Player authority;
- authentication uses `touchActivity=false` like other Hunt GETs;
- credentialed CORS remains exact-origin only; no wildcard authenticated CORS;
- no CSRF token is required because this route is a read with no state change;
- `Content-Type: application/json; charset=UTF-8`;
- `Cache-Control: private, no-store`.

An authenticated account with no Player remains indistinguishable from an absent self-scoped resource and follows the existing `404 not_found` convention.

## 7. Exact response candidate

Success `200` returns exactly:

```json
{
  "gameDataVersion": "game-data-core-kanto-johto-v5",
  "bundleHash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "huntDefinitionId": "hunt:verdant-edge:wilds",
  "preview": {
    "possibleSpeciesIds": [
      "candidate:species:pokedex-caterpie-10:f77ea3bb04"
    ],
    "playerXp": { "min": 2, "max": 6 },
    "pokemonXpPool": { "min": 6, "max": 18 },
    "itemDrops": [
      {
        "itemId": "pokenexus:item:poke-ball:v1",
        "quantity": { "min": 1, "max": 1 },
        "chanceBasisPoints": { "min": 1500, "max": 1500 }
      }
    ]
  }
}
```

The concrete identifiers/values above are illustrative content, not protocol constants.

### 7.1 Projection semantics

For the selected Hunt in the selected current release:

- `possibleSpeciesIds` is the lexicographically sorted, deduplicated set of Species IDs present in at least one valid Encounter row for that Hunt. It exposes **no encounter weight or Species probability**.
- `playerXp` is `null` when every valid Encounter row has no Player-XP grant; otherwise it is the minimum and maximum configured Player-XP amount across **all** possible Encounter rows, treating a row with no Player-XP grant as `0`. This prevents a mixed reward table from overstating its lower bound.
- `pokemonXpPool` is the minimum and maximum configured Pokémon-XP pool across all valid Encounter rows for that Hunt.
- `itemDrops` contains one lexicographically sorted row per Item ID whose maximum configured chance across the Hunt is greater than `0`; an Item that can never actually drop is omitted from the preview.
- `quantity.min/max` is the minimum/maximum positive configured quantity among Encounter rows in which that Item can drop.
- `chanceBasisPoints.min/max` is the minimum/maximum configured per-Encounter drop chance over **all** possible Encounter rows for the Hunt; an Encounter row where the Item is absent contributes `0`. This prevents the preview from overstating the lower bound when an Item is unavailable in some Encounters.
- `chanceBasisPoints` is a configured conditional range, **not** a weighted overall Hunt probability. The server never exposes Encounter weights merely to calculate or explain this preview.

The projection is deterministic for one exact `{gameDataVersion, bundleHash, huntDefinitionId}` and contains no Player-specific calculation.

### 7.2 Shape and numeric constraints

- all IDs are non-empty canonical content identifiers already accepted by the underlying immutable schema;
- `gameDataVersion` is at most 128 characters and matches the already accepted SPEC-018 transport grammar;
- `bundleHash` must match `^sha256:[0-9a-f]{64}$`;
- every XP, quantity and basis-point value is an integer representable exactly as a JSON number under the accepted immutable game-data schema;
- all min/max pairs satisfy `0 <= min <= max` except item quantity, which satisfies `1 <= min <= max`;
- basis points satisfy `0..10000`;
- `possibleSpeciesIds` must be non-empty for a valid selectable Hunt.

## 8. Bounds

The candidate v1 service rejects rather than truncates when any bound is exceeded:

- maximum canonical `catalogs/encounter-definitions` artifact size consumed by this read: `4 MiB` (`4,194,304` bytes);
- maximum `catalogs/encounter-definitions` manifest `recordCount` consumed by this read: `4096` rows across the selected release; this deliberately matches the existing bounded TASK-039 projection model rather than inventing an unbounded server scan;
- maximum `512` projected Species IDs;
- maximum `256` projected Item rows;
- maximum successful JSON response body: `256 KiB` before transfer encoding;
- maximum JSON error body: `4 KiB`;
- no request body and no query parameters;
- `huntDefinitionId` uses the existing bounded content-ID parser and must not exceed `512` characters.

The service MUST reject from the verified manifest metadata before loading/parsing Encounter bytes when `recordCount > 4096`. Its bounded reader MUST also stop/reject once the Encounter artifact exceeds `4 MiB`; it may not read an arbitrarily large object and only then decide it is too large. These ceilings bound the full input scan/parse work for one preview request independently of how strongly rows deduplicate in the public result.

These are transport/abuse/disclosure ceilings, not gameplay limits and do not constrain authoritative Hunt execution itself. A valid internal publication that cannot fit the SPEC-024 preview-input or public-projection contract fails closed as `503 authority_unavailable`; the server must not silently truncate Encounter rows, Species, reward rows or numeric ranges.

## 9. Errors and fail-closed behavior

All error bodies use the bounded envelope `{ "error": "machine_readable_code" }`.

- `400 invalid_request` — malformed/unsupported `huntDefinitionId` path syntax or any unexpected request shape;
- `401 unauthorized` — missing/expired normal session;
- `404 not_found` — authenticated Player absent, or requested HuntDefinitionId does not exist in the server-selected current publication;
- `503 authority_unavailable` — selected release cannot be resolved/verified, required internal Encounter authority is missing/corrupt, a valid Hunt has no valid Encounter rows, projection constraints cannot be satisfied, or the projection exceeds accepted bounds;
- unexpected infrastructure faults remain generic server errors and disclose no storage credentials, internal artifact path, provenance secret, RNG state or raw Encounter content.

There is no fallback to repository-local fixtures, previously cached previews, raw Encounter artifacts, a different retained release or a guessed Hunt.

## 10. Release consistency and Start semantics

The browser combines SPEC-018 selector content and this preview only when both report the same `gameDataVersion` + `bundleHash`. A mismatch disables new Start and causes the client to reread the current selector descriptor and preview; it may not merge Zone/Hunt labels from one release with preview facts from another.

The preview is **advisory published-content presentation**, not admission or mutation authority. The Start request remains exactly SPEC-015:

```json
{
  "huntDefinitionId": "opaque",
  "teamId": "uuid"
}
```

The client sends no preview release identity or preview token to Start. `POST /player/hunts/start` re-resolves the exact current new-operation Hunt/Zone/game-data/rules/policy authority, Team state, recovery and admission at acceptance time.

Therefore a release may change after a valid preview but before Start. Under the Human-selected Option 1, Start is allowed to accept the same `huntDefinitionId` under the newer current release if the existing SPEC-015 rules permit it. The UI must present the read as a **preview** and must not claim that the exact preview release is guaranteed to execute. This explicit contract is the selected alternative to exact preview-release binding.

If the client itself observes a new SPEC-018 descriptor before issuing Start, it MUST discard any preview with a different release identity and fetch a new projection first. It cannot knowingly start from a mismatched preview.

## 11. Cache, retention and logging

- Browser/API response semantics are `private, no-store`; a preview is not durable Player state.
- The client may keep the current projection in memory while its matching release descriptor remains current, but must not use persisted LocalStorage/IndexedDB/service-worker data as authority for a new Start.
- Server-side deterministic caching is implementation-owned only when keyed by exact `{gameDataVersion, bundleHash, huntDefinitionId}` and cannot survive an authority-key mismatch as if current.
- The projection creates no Player mutation, no durable preview token and no retry/idempotency record.
- Normal security/operational logs may record bounded route/result metadata and non-secret content/release identifiers, but should not log full projection bodies by default.

## 12. Privacy and disclosure boundary

The v1 response is intentionally less revealing than `catalogs/encounter-definitions`.

Allowed disclosure:

- immutable release identity;
- selected HuntDefinitionId;
- set of possible Species IDs;
- bounded XP ranges;
- possible Item IDs plus configured quantity and chance ranges.

Forbidden disclosure includes, at minimum:

- EncounterDefinitionId / Encounter ordinal;
- Encounter selection weights or derived Species probabilities;
- level bands or a concrete next level;
- per-Encounter reward envelopes;
- RNG seeds, draws or replay/correlation identifiers;
- hidden wild HP, IV/Genetics, Nature, Shiny state/outcome;
- capture chance/result evidence;
- Player Inventory quantity, Team/vitality/admission state, policy choices or Player identifiers;
- storage origin credentials, source/provenance audit blobs or internal file paths.

## 13. SPEC-018 relationship

SPEC-024 is additive authenticated read authority only. It does not reinterpret SPEC-018 as permitting Encounter-definition publication and does not change SPEC-018's exact release-descriptor/artifact response shapes.

The server may reuse SPEC-018's internal verified publication reader and independently pinned release identity. Browser-facing raw Encounter artifacts remain unauthorized.

## 14. Current Verdant Edge → Wilds example

For the current retained first-Pre-alpha `Verdant Edge -> Wilds` profile, the projection algorithm yields six possible Species IDs, Player XP `2..6`, Pokémon XP pool `6..18`, and the currently configured Poké Ball / Basic Potion reward rows. The exact Species IDs, Item IDs, quantities and chances are content data and can change in a later accepted immutable release without changing this protocol.

This example proves that the selected projection is sufficient for the existing TASK-039 Start UI while avoiding raw Encounter IDs, weights and level rows.

## 15. Contract validation evidence

Independent contract QA confirmed:

- the shape is sufficient for TASK-039 without browser-side Encounter definitions or local authority;
- existing Zone/Hunt selector data plus this response can populate the current Pre-Start UI;
- the release-mismatch rule prevents knowingly combining two releases;
- unknown Hunt, missing/corrupt/oversized authority and release switch scenarios fail closed;
- no Start request/semantics were changed.

Independent security/privacy review confirmed:

- no Player ID or private Player facts are introduced;
- `touchActivity=false` is required for the GET;
- raw Encounter identity/weights/level bands/RNG/private state remain undisclosed;
- error, response and count bounds are adequate to prevent accidental broad publication;
- exact-origin credentialed CORS/session semantics remain inherited from ADR-006/SPEC-011/SPEC-015.

## 16. Human acceptance record

On 2026-10-06 the Human Owner explicitly **APPROVED** the complete v1 protocol after first selecting Option 1. The accepted contract includes:

1. distinct route `GET /player/hunts/prestart-preview/:huntDefinitionId`;
2. exact response fields and aggregation semantics;
3. `4 MiB` / `4096` Encounter input ceilings plus `512` Species / `256` Item / `256 KiB` response ceilings;
4. fail-closed error mapping and no fallback;
5. `private, no-store` + non-persistent client authority;
6. no raw Encounter definitions and no Start release binding.

That approval authorizes implementation, validation and repository-history integration of the exact v1 contract above. It does **not** authorize raw Encounter publication, exact-preview-release Start binding, deploy/public enablement, TASK-120/121, eligible-Moves, or any unrelated protocol expansion.
