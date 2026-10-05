export function deny(): never {
  // Diagnostic text must not serialize values from an invalid public envelope.
  throw new Error("Independent public JSON privacy oracle rejected the envelope");
}

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) deny();
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) deny();
  return value as unknown[];
}

function shape(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const entry = object(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(entry, key))
    || Object.keys(entry).some((key) => !allowed.has(key))) deny();
  return entry;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) deny();
  return value;
}

function safeInteger(value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) deny();
}

function boolean(value: unknown): void {
  if (typeof value !== "boolean") deny();
}

function visibleState(value: unknown): void {
  if (value !== "conscious" && value !== "ko") deny();
}

function stringArray(value: unknown): void {
  for (const entry of array(value)) string(entry);
}

function hiddenHp(value: unknown): void {
  const hp = shape(value, ["visibility"]);
  if (hp.visibility !== "hidden") deny();
}

function privateSafeHp(value: unknown, exactAllowed: boolean): void {
  const hp = object(value);
  if (hp.visibility === "hidden") {
    hiddenHp(hp);
    return;
  }
  if (!exactAllowed || hp.visibility !== "exact") deny();
  shape(hp, ["visibility", "amount", "resultingHp"]);
  safeInteger(hp.amount);
  safeInteger(hp.resultingHp);
}

type Kinds = ReadonlyMap<string, "owned" | "wild">;
export type BattlePrivacyRoles = ReadonlyMap<string, Kinds>;

function auditEvent(value: unknown, kinds: Kinds): void {
  const event = object(value);
  const base = ["kind", "sequence", "combatTimeMs"];
  const known = (id: unknown): "owned" | "wild" => {
    const found = kinds.get(string(id));
    if (!found) deny();
    return found;
  };
  safeInteger(event.sequence);
  safeInteger(event.combatTimeMs);
  switch (event.kind) {
    case "BattleStarted":
      shape(event, [...base, "battleId"]);
      string(event.battleId);
      break;
    case "MoveUsed":
      shape(event, [...base, "actorId", "moveId", "targetIds"]);
      known(event.actorId);
      string(event.moveId);
      array(event.targetIds).forEach(known);
      break;
    case "MoveMissed":
    case "MoveImmune":
    case "CriticalHit":
      shape(event, [...base, "actorId", "moveId", "targetId"]);
      known(event.actorId);
      string(event.moveId);
      known(event.targetId);
      break;
    case "DamageApplied": {
      shape(event, [...base, "source", "targetId", "hpChange"], ["actorId", "moveId"]);
      if (event.source !== "move" && event.source !== "effect") deny();
      if (event.moveId !== undefined) string(event.moveId);
      const actorKind = event.actorId === undefined ? null : known(event.actorId);
      const targetKind = known(event.targetId);
      const ownToOwn = actorKind === "owned" && targetKind === "owned";
      privateSafeHp(event.hpChange, ownToOwn);
      break;
    }
    case "CombatantKO":
      shape(event, [...base, "combatantId"]);
      known(event.combatantId);
      break;
    case "CombatantRevived": {
      shape(event, [...base, "combatantId", "hpChange"]);
      const combatantKind = known(event.combatantId);
      privateSafeHp(event.hpChange, combatantKind === "owned");
      break;
    }
    case "CombatantActivated":
      shape(event, [...base, "sideId", "combatantId"]);
      string(event.sideId);
      known(event.combatantId);
      break;
    case "BattleEnded": {
      shape(event, [...base, "outcome"]);
      const outcome = object(event.outcome);
      if (outcome.kind === "draw") shape(outcome, ["kind"]);
      else if (outcome.kind === "win") {
        shape(outcome, ["kind", "winnerSideId"]);
        string(outcome.winnerSideId);
      }
      else deny();
      break;
    }
    case "EffectApplied":
    case "EffectUpdated":
      shape(event, [...base, "effectId", "targetId"], ["stacks"]);
      string(event.effectId);
      known(event.targetId);
      if (event.stacks !== undefined) safeInteger(event.stacks);
      break;
    case "EffectRemoved":
      shape(event, [...base, "effectId", "targetId"]);
      string(event.effectId);
      known(event.targetId);
      break;
    case "EffectTicked":
      shape(event, [...base, "effectId", "targetId", "consequence", "hpChange"]);
      string(event.effectId);
      known(event.targetId);
      if (event.consequence !== "damage" && event.consequence !== "healing") deny();
      hiddenHp(event.hpChange);
      break;
    case "HealingApplied":
      shape(event, [...base, "targetId", "hpChange"]);
      known(event.targetId);
      hiddenHp(event.hpChange);
      break;
    case "StatStageChanged":
      shape(event, [...base, "targetId", "stat", "requestedDelta", "appliedDelta", "resultingStage"]);
      known(event.targetId);
      if (!["atk", "def", "spa", "spd", "spe"].includes(String(event.stat))) deny();
      safeInteger(event.requestedDelta);
      safeInteger(event.appliedDelta);
      safeInteger(event.resultingStage);
      break;
    default:
      deny();
  }
}

/**
 * Test-only independent privacy oracle. The role mapping is supplied from
 * authoritative fixture data, never derived from projected public identity.
 * One instance audits an ordered page chain from the same signed snapshot.
 */
export function createPublicJsonPrivacyOracle(rolesByBattle: BattlePrivacyRoles): {
  auditPage(value: unknown): void;
} {
  const seenBootstraps = new Set<string>();
  const auditPage = (value: unknown): void => {
    const page = shape(value, [
      "huntId", "presentationSchemaVersion", "sourceCombatEventSchemaVersion", "stream",
      "battles", "hasMore", "nextCursor", "resumeCursor",
    ]);
    string(page.huntId);
    string(page.presentationSchemaVersion);
    string(page.sourceCombatEventSchemaVersion);
    boolean(page.hasMore);
    if (page.nextCursor !== null) string(page.nextCursor);
    if (page.resumeCursor !== null) string(page.resumeCursor);
    const stream = shape(page.stream, ["snapshotId", "committedLogicalTimeMs", "isTerminal"]);
    string(stream.snapshotId);
    string(stream.committedLogicalTimeMs);
    boolean(stream.isTerminal);
    for (const value of array(page.battles)) {
      const battle = shape(value, [
        "encounterId", "encounterOrdinal", "battleStartedAtHuntTimeMs", "presentation",
      ]);
      string(battle.encounterId);
      safeInteger(battle.encounterOrdinal);
      string(battle.battleStartedAtHuntTimeMs);
      const presentation = object(battle.presentation);
      string(presentation.schemaVersion);
      string(presentation.sourceCombatEventSchemaVersion);
      const publicBattleId = string(presentation.battleId);
      const sourceKinds = rolesByBattle.get(publicBattleId);
      if (!sourceKinds) deny();
      if (presentation.kind === "bootstrap") {
        if (seenBootstraps.has(publicBattleId)) deny();
        shape(presentation, [
          "kind", "schemaVersion", "sourceCombatEventSchemaVersion",
          "battleId", "initialSides", "initialParticipants", "events",
        ]);
        for (const value of array(presentation.initialSides)) {
          const side = shape(value, ["sideId", "combatantIds", "activeCombatantIds"]);
          string(side.sideId);
          stringArray(side.combatantIds);
          stringArray(side.activeCombatantIds);
        }
        const seenParticipants = new Set<string>();
        for (const value of array(presentation.initialParticipants)) {
          const participant = shape(value, ["combatantId", "sideId", "identity", "vitality"]);
          const identity = object(participant.identity);
          const combatantId = string(participant.combatantId);
          string(participant.sideId);
          const sourceKind = sourceKinds.get(combatantId);
          if (!sourceKind || seenParticipants.has(combatantId)) deny();
          if (identity.kind === "wild_pokemon") {
            if (sourceKind !== "wild") deny();
            shape(identity, ["kind", "speciesId", "level", "shiny"]);
            string(identity.speciesId);
            safeInteger(identity.level);
            boolean(identity.shiny);
            const vitality = shape(participant.vitality, ["visibility", "state"]);
            if (vitality.visibility !== "hidden") deny();
            visibleState(vitality.state);
            seenParticipants.add(combatantId);
          } else if (identity.kind === "owned_pokemon") {
            if (sourceKind !== "owned") deny();
            shape(identity, ["kind", "pokemonInstanceId", "speciesId", "level", "shiny"]);
            string(identity.pokemonInstanceId);
            string(identity.speciesId);
            safeInteger(identity.level);
            boolean(identity.shiny);
            const vitality = shape(participant.vitality, [
              "visibility", "state", "currentHp", "maxHp",
            ]);
            if (vitality.visibility !== "exact") deny();
            visibleState(vitality.state);
            safeInteger(vitality.currentHp);
            safeInteger(vitality.maxHp);
            seenParticipants.add(combatantId);
          } else deny();
        }
        if (seenParticipants.size !== sourceKinds.size) deny();
        seenBootstraps.add(publicBattleId);
      } else if (presentation.kind === "continuation") {
        shape(presentation, ["kind", "schemaVersion", "sourceCombatEventSchemaVersion", "battleId", "events"]);
        if (!seenBootstraps.has(publicBattleId)) deny();
      } else deny();
      for (const event of array(presentation.events)) auditEvent(event, sourceKinds);
    }
  };
  return { auditPage };
}
