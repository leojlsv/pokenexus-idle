import type {
  MappingRegistry,
  SourceInventory,
  ValidationFinding,
} from "./schema.js";

function issue(code: string, path: string, message: string): ValidationFinding {
  return { code, path, message };
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const normalized = value.normalize("NFC");
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates].sort();
}

export function reconcileSourceInventory(inventory: SourceInventory): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const path = `inventory.${inventory.surface}`;
  for (const field of ["discoveredSourceKeys", "acceptedMappingKeys", "extractedSourceKeys", "normalizedSourceKeys", "candidateSourceKeys"] as const) {
    for (const duplicate of duplicateValues(inventory[field])) findings.push(issue("duplicate-inventory-key", `${path}.${field}`, `duplicate source key ${duplicate}`));
  }

  const discovered = new Set(inventory.discoveredSourceKeys);
  const accepted = new Set(inventory.acceptedMappingKeys);
  const extracted = new Set(inventory.extractedSourceKeys);
  const normalized = new Set(inventory.normalizedSourceKeys);
  const candidates = new Set(inventory.candidateSourceKeys);
  const explained = new Set<string>();

  for (const [index, excluded] of inventory.excludedOrDeferred.entries()) {
    if (!excluded.reason.trim()) findings.push(issue("invalid-exclusion", `${path}.excludedOrDeferred[${index}].reason`, "excluded/deferred source key requires a policy reason"));
    if (explained.has(excluded.sourceKey)) findings.push(issue("invalid-exclusion", `${path}.excludedOrDeferred[${index}].sourceKey`, "source key has duplicate exclusion/defer disposition"));
    explained.add(excluded.sourceKey);
    if (!discovered.has(excluded.sourceKey)) findings.push(issue("invalid-exclusion", `${path}.excludedOrDeferred[${index}].sourceKey`, "excluded/deferred key was not discovered"));
    if (accepted.has(excluded.sourceKey) || normalized.has(excluded.sourceKey)) findings.push(issue("invalid-exclusion", `${path}.excludedOrDeferred[${index}].sourceKey`, "excluded/deferred key cannot also be accepted/normalized"));
  }

  for (const key of discovered) {
    if (!accepted.has(key) && !explained.has(key) && !candidates.has(key)) findings.push(issue("unmapped-discovered-key", path, `discovered source key ${key} is neither accepted, excluded/deferred nor staged as candidate`));
  }
  for (const key of accepted) {
    if (!discovered.has(key) || !extracted.has(key)) findings.push(issue("missing-accepted-key", path, `accepted mapping key ${key} was not discovered and extracted`));
  }
  for (const key of extracted) {
    if (!normalized.has(key) && !explained.has(key)) findings.push(issue("extracted-not-normalized", path, `extracted source key ${key} has no normalized record`));
  }
  for (const key of normalized) {
    if (!extracted.has(key)) findings.push(issue("normalized-without-extraction", path, `normalized source key ${key} has no supporting extraction`));
  }
  for (const previous of inventory.previousAcceptedMappingKeys ?? []) {
    if (!accepted.has(previous)) findings.push(issue("mapping-removed-or-renamed", path, `previously accepted source key ${previous} is no longer accepted`));
  }
  return findings;
}

export function validateMappingRegistry(registry: MappingRegistry): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const catalogs = [
    ["species", registry.species],
    ["moves", registry.moves],
    ["types", registry.types],
    ["abilities", registry.abilities],
    ["items", registry.items],
  ] as const;
  for (const [catalog, entries] of catalogs) {
    const sourceToIds = new Map<string, Set<string>>();
    const canonicalIds = new Map<string, Set<string>>();
    for (const entry of entries) {
      if (!entry.sourceKey.trim() || !entry.canonicalId.trim()) {
        findings.push(issue("invalid-mapping", `mapping.${catalog}`, "mapping sourceKey/canonicalId must be non-empty"));
        continue;
      }
      const sourceKey = entry.sourceKey.normalize("NFC");
      const canonicalId = entry.canonicalId.normalize("NFC");
      const ids = sourceToIds.get(sourceKey) ?? new Set<string>();
      ids.add(canonicalId);
      sourceToIds.set(sourceKey, ids);
      const sources = canonicalIds.get(canonicalId) ?? new Set<string>();
      sources.add(sourceKey);
      canonicalIds.set(canonicalId, sources);
    }
    for (const [sourceKey, ids] of sourceToIds) if (ids.size > 1) findings.push(issue("duplicate-source-mapping", `mapping.${catalog}.${sourceKey}`, "one source key maps to multiple canonical IDs"));
    for (const [canonicalId, sources] of canonicalIds) if (sources.size > 1) findings.push(issue("duplicate-canonical-mapping", `mapping.${catalog}.${canonicalId}`, "one canonical ID maps from multiple source keys"));
  }
  return findings;
}
