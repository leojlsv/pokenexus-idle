import { applyResponsePolicy } from "./client-policy";
import {
  loadPublishedHuntChoices,
  parsePublishedHuntReleaseDescriptor,
  type PublishedHuntChoices,
} from "./hunt-published-choices";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/u;
const MAX_ERROR_BYTES = 4096;
const MAX_CATALOG_BYTES = 1024 * 1024;

export class HuntApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Hunt API returned HTTP ${status} (${code})`);
    this.name = "HuntApiError";
  }
}

export interface HuntMember {
  readonly pokemonInstanceId: string;
  readonly speciesId: string;
  readonly level: number;
  readonly selectedAbilityId: string | null;
  readonly moveIds: readonly string[];
  readonly currentHp: number;
  readonly maxHp: number;
}

export interface HuntState {
  readonly activeHunt: {
    readonly huntId: string;
    readonly huntDefinitionId: string;
    readonly zoneId: string;
    readonly logicalTimeMs: string;
    readonly startedAt: string;
    readonly effectiveAutoCapturePolicyVersion: string | null;
    readonly team: readonly HuntMember[];
    readonly currentEncounter: {
      readonly encounterId: string;
      readonly speciesId: string;
      readonly level: number;
      readonly catchRate: number;
      readonly shiny: boolean;
    } | null;
  } | null;
  readonly recoveryReadyAt: string | null;
  /** Legacy compatibility signal only. Forward Card Mode never renders capture controls. */
  readonly legacyPendingManualCapture: boolean;
}

export interface OrderedAutomationItem {
  readonly itemId: string;
  readonly autoUseEnabled: boolean;
  readonly minimumReserve: string;
}

export interface CapturePolicyRule {
  readonly when: {
    readonly shiny?: boolean;
    readonly speciesIds?: readonly string[];
    readonly zoneIds?: readonly string[];
    readonly huntDefinitionIds?: readonly string[];
    readonly catchRateMin?: number;
    readonly catchRateMax?: number;
  };
  readonly selectedItemId: string;
}

export interface AutoCapturePolicy {
  readonly policyVersion: string | null;
  readonly ballAuthorityVersion: string;
  readonly rowVersion: string;
  readonly enabled: boolean;
  readonly balls: readonly OrderedAutomationItem[];
  readonly rules: readonly CapturePolicyRule[];
}

export interface AutoPotionPolicy {
  readonly policyVersion: string | null;
  readonly rowVersion: string;
  readonly enabled: boolean;
  readonly thresholdPercent: 90 | 80 | 70 | 60 | 50 | 40 | 30 | 20 | 10 | null;
  readonly orderedItems: readonly OrderedAutomationItem[];
}

export interface AutoRevivePolicy {
  readonly policyVersion: string | null;
  readonly rowVersion: string;
  readonly enabled: boolean;
  readonly orderedItems: readonly OrderedAutomationItem[];
}

export interface CaptureBallCatalog {
  readonly ballAuthorityVersion: string;
  readonly balls: readonly {
    readonly itemId: string;
    readonly powerQuarterUnits: number;
    readonly premium: boolean;
  }[];
}

export interface SavedTeamsPage {
  readonly teams: readonly { readonly teamId: string; readonly rowVersion: string }[];
  readonly nextCursor: string | null;
}

export interface SavedTeamDetail {
  readonly teamId: string;
  readonly pokemonInstanceIds: readonly string[];
  readonly rowVersion: string;
}

export interface OwnedPokemonPreview {
  readonly pokemonInstanceId: string;
  readonly speciesId: string;
  readonly level: number;
  readonly selectedAbilityId: string | null;
  readonly moveIds: readonly string[];
}

export interface InventoryPage {
  readonly rowVersion: string;
  readonly entries: readonly { readonly itemId: string; readonly quantity: string }[];
  readonly nextCursor: string | null;
}

export interface HuntActivityRecord {
  readonly encounterOrdinal: number;
  readonly encounterId: string;
  readonly resolvedAtHuntTimeMs: number;
  readonly outcome: "win" | "draw";
  readonly encounterDisposition: "victory" | "resolved_non_win";
  readonly captureDisposition: Readonly<Record<string, unknown>>;
  readonly playerXp: string;
  readonly pokemonXp: readonly { readonly pokemonInstanceId: string; readonly amount: string }[];
  readonly itemDrops: readonly { readonly itemId: string; readonly quantity: string }[];
  readonly consumedItems: readonly { readonly itemId: string; readonly quantity: string }[];
  readonly koSummary: readonly { readonly side: "player" | "opponent"; readonly count: number }[];
  readonly reviveSummary: readonly {
    readonly phase: "battle" | "post_battle";
    readonly targetPokemonInstanceId: string;
    readonly itemId: string;
    readonly appliedHp: number;
    readonly resultingHp: number;
    readonly logicalTimeMs: number;
  }[];
}

export interface HuntActivityPage {
  readonly huntId: string;
  readonly records: readonly HuntActivityRecord[];
  readonly nextCursor: string | null;
}

export type HuntMutationResult =
  | { readonly kind: "complete" }
  | {
      readonly kind: "in_progress";
      readonly logicalTimeMs: string;
      readonly targetLogicalTimeMs: string;
    };

export type HuntReconciliationMode = "online" | "return";

function object(value: unknown, label = "response"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function opaque(value: unknown, label = "identity"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) throw new Error(`Invalid ${label}`);
  return value;
}

function uuid(value: unknown, label = "UUID"): string {
  const parsed = opaque(value, label);
  if (!UUID_RE.test(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function decimal(value: unknown, label = "integer"): string {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER, label = "integer"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function bool(value: unknown, label = "boolean"): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${label}`);
  return value;
}

function dateOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).valueOf())) throw new Error("Invalid timestamp");
  return value;
}

function parseEffectiveAt(value: unknown): void {
  if (value === null) return;
  const row = object(value, "policy effectiveAt");
  uuid(row.huntId, "effective Hunt ID");
  decimal(row.logicalTimeMs, "effective logicalTimeMs");
}

function stringList(value: unknown, maximum: number, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Invalid ${label}`);
  const parsed = value.map((entry) => opaque(entry, label));
  if (new Set(parsed).size !== parsed.length) throw new Error(`Duplicate ${label}`);
  return parsed;
}

function orderedItem(value: unknown): OrderedAutomationItem {
  const row = object(value, "automation item");
  return {
    itemId: opaque(row.itemId, "itemId"),
    autoUseEnabled: bool(row.autoUseEnabled, "autoUseEnabled"),
    minimumReserve: decimal(row.minimumReserve, "minimumReserve"),
  };
}

export function parseHuntState(value: unknown): HuntState {
  const row = object(value, "Hunt state");
  const active = row.activeHunt === null ? null : object(row.activeHunt, "active Hunt");
  const activeHunt = active === null ? null : (() => {
    if (active.status !== "active" || !Array.isArray(active.team) || active.team.length > 6) {
      throw new Error("Invalid active Hunt");
    }
    const team = active.team.map((entry): HuntMember => {
      const member = object(entry, "Hunt Team member");
      const currentHp = integer(member.currentHp, 0, Number.MAX_SAFE_INTEGER, "currentHp");
      const maxHp = integer(member.maxHp, 1, Number.MAX_SAFE_INTEGER, "maxHp");
      if (currentHp > maxHp) throw new Error("Invalid current HP");
      return {
        pokemonInstanceId: uuid(member.pokemonInstanceId, "pokemonInstanceId"),
        speciesId: opaque(member.speciesId, "speciesId"),
        level: integer(member.level, 1, 1_000_000, "level"),
        selectedAbilityId: member.selectedAbilityId === null ? null : opaque(member.selectedAbilityId, "abilityId"),
        moveIds: stringList(member.moveIds, 4, "moveIds"),
        currentHp,
        maxHp,
      };
    });
    let currentEncounter: HuntState["activeHunt"] extends infer T
      ? T extends { currentEncounter: infer E } ? E : never
      : never = null;
    if (active.currentEncounter !== null) {
      const encounter = object(active.currentEncounter, "current Encounter");
      currentEncounter = {
        encounterId: opaque(encounter.encounterId, "encounterId"),
        speciesId: opaque(encounter.speciesId, "speciesId"),
        level: integer(encounter.level, 1, 1_000_000, "level"),
        catchRate: integer(encounter.catchRate, 3, 255, "catchRate"),
        shiny: bool(encounter.shiny, "shiny"),
      };
    }
    return {
      huntId: uuid(active.huntId, "huntId"),
      huntDefinitionId: opaque(active.huntDefinitionId, "huntDefinitionId"),
      zoneId: opaque(active.zoneId, "zoneId"),
      logicalTimeMs: decimal(active.logicalTimeMs, "logicalTimeMs"),
      startedAt: dateOrNull(active.startedAt) ?? (() => { throw new Error("Missing Hunt start timestamp"); })(),
      effectiveAutoCapturePolicyVersion: active.effectiveAutoCapturePolicyVersion === null
        ? null : uuid(active.effectiveAutoCapturePolicyVersion, "capture policy version"),
      team,
      currentEncounter,
    };
  })();
  if (row.pendingManualCapture !== null && (row.pendingManualCapture === undefined || typeof row.pendingManualCapture !== "object")) {
    throw new Error("Invalid legacy pending capture marker");
  }
  return {
    activeHunt,
    recoveryReadyAt: dateOrNull(row.recoveryReadyAt),
    legacyPendingManualCapture: row.pendingManualCapture !== null,
  };
}

export function parseAutoCapturePolicy(value: unknown): AutoCapturePolicy {
  const row = object(value, "auto-capture policy");
  if (!Array.isArray(row.balls) || row.balls.length > 16 || !Array.isArray(row.rules) || row.rules.length > 64) {
    throw new Error("Invalid auto-capture policy");
  }
  const rules = row.rules.map((entry): CapturePolicyRule => {
    const rule = object(entry, "capture rule");
    const when = object(rule.when, "capture condition");
    const parsed: {
      shiny?: boolean;
      speciesIds?: readonly string[];
      zoneIds?: readonly string[];
      huntDefinitionIds?: readonly string[];
      catchRateMin?: number;
      catchRateMax?: number;
    } = {};
    if (when.shiny !== undefined) parsed.shiny = bool(when.shiny, "shiny condition");
    for (const key of ["speciesIds", "zoneIds", "huntDefinitionIds"] as const) {
      if (when[key] !== undefined) parsed[key] = stringList(when[key], 64, key);
    }
    if (when.catchRateMin !== undefined) parsed.catchRateMin = integer(when.catchRateMin, 3, 255, "catchRateMin");
    if (when.catchRateMax !== undefined) parsed.catchRateMax = integer(when.catchRateMax, 3, 255, "catchRateMax");
    return { when: parsed, selectedItemId: opaque(rule.selectedItemId, "selectedItemId") };
  });
  return {
    policyVersion: row.policyVersion === null ? null : uuid(row.policyVersion, "policyVersion"),
    ballAuthorityVersion: opaque(row.ballAuthorityVersion, "ballAuthorityVersion"),
    rowVersion: decimal(row.rowVersion, "rowVersion"),
    enabled: bool(row.enabled, "enabled"),
    balls: row.balls.map(orderedItem),
    rules,
  };
}

const POTION_THRESHOLDS = new Set([90, 80, 70, 60, 50, 40, 30, 20, 10]);

export function parseAutoPotionPolicy(value: unknown): AutoPotionPolicy {
  const row = object(value, "auto-potion policy");
  if (!Array.isArray(row.orderedItems) || row.orderedItems.length > 64) throw new Error("Invalid auto-potion policy");
  const threshold = row.thresholdPercent === null ? null : integer(row.thresholdPercent, 10, 90, "thresholdPercent");
  if (threshold !== null && !POTION_THRESHOLDS.has(threshold)) throw new Error("Unsupported Potion threshold");
  return {
    policyVersion: row.policyVersion === null ? null : uuid(row.policyVersion, "policyVersion"),
    rowVersion: decimal(row.rowVersion, "rowVersion"),
    enabled: bool(row.enabled, "enabled"),
    thresholdPercent: threshold as AutoPotionPolicy["thresholdPercent"],
    orderedItems: row.orderedItems.map(orderedItem),
  };
}

export function parseAutoRevivePolicy(value: unknown): AutoRevivePolicy {
  const row = object(value, "auto-revive policy");
  if (!Array.isArray(row.orderedItems) || row.orderedItems.length > 64) throw new Error("Invalid auto-revive policy");
  return {
    policyVersion: row.policyVersion === null ? null : uuid(row.policyVersion, "policyVersion"),
    rowVersion: decimal(row.rowVersion, "rowVersion"),
    enabled: bool(row.enabled, "enabled"),
    orderedItems: row.orderedItems.map(orderedItem),
  };
}

function itemAmounts(value: unknown, label: string): readonly { itemId: string; quantity: string }[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error(`Invalid ${label}`);
  return value.map((entry) => {
    const row = object(entry, label);
    return { itemId: opaque(row.itemId, "itemId"), quantity: decimal(row.quantity, "quantity") };
  });
}

function parseActivityRecord(value: unknown): HuntActivityRecord {
  const row = object(value, "Hunt activity");
  if (row.schemaVersion !== "pokenexus.hunt-activity.v1") throw new Error("Unsupported Hunt activity version");
  const battle = object(row.battleResolved, "battle resolution");
  if (battle.outcome !== "win" && battle.outcome !== "draw") throw new Error("Invalid battle outcome");
  if (row.encounterDisposition !== "victory" && row.encounterDisposition !== "resolved_non_win") {
    throw new Error("Invalid Encounter disposition");
  }
  if (!Array.isArray(row.pokemonXp) || !Array.isArray(row.koSummary) || !Array.isArray(row.reviveSummary)) {
    throw new Error("Invalid Hunt activity arrays");
  }
  const captureDisposition = object(row.captureDisposition, "capture disposition");
  return {
    encounterOrdinal: integer(row.encounterOrdinal, 1, Number.MAX_SAFE_INTEGER, "encounterOrdinal"),
    encounterId: opaque(row.encounterId, "encounterId"),
    resolvedAtHuntTimeMs: integer(row.resolvedAtHuntTimeMs, 0, Number.MAX_SAFE_INTEGER, "resolvedAtHuntTimeMs"),
    outcome: battle.outcome,
    encounterDisposition: row.encounterDisposition,
    captureDisposition,
    playerXp: decimal(row.playerXp, "playerXp"),
    pokemonXp: row.pokemonXp.map((entry) => {
      const xp = object(entry, "Pokémon XP");
      return { pokemonInstanceId: uuid(xp.pokemonInstanceId, "pokemonInstanceId"), amount: decimal(xp.amount, "XP") };
    }),
    itemDrops: itemAmounts(row.itemDrops, "item drops"),
    consumedItems: itemAmounts(row.consumedItems, "consumed items"),
    koSummary: row.koSummary.map((entry) => {
      const ko = object(entry, "KO summary");
      if (ko.side !== "player" && ko.side !== "opponent") throw new Error("Invalid KO side");
      return { side: ko.side, count: integer(ko.count, 0, Number.MAX_SAFE_INTEGER, "KO count") };
    }),
    reviveSummary: row.reviveSummary.map((entry) => {
      const revive = object(entry, "Revive summary");
      if (revive.phase !== "battle" && revive.phase !== "post_battle") throw new Error("Invalid Revive phase");
      return {
        phase: revive.phase,
        targetPokemonInstanceId: uuid(revive.targetPokemonInstanceId, "pokemonInstanceId"),
        itemId: opaque(revive.itemId, "itemId"),
        appliedHp: integer(revive.appliedHp, 1, Number.MAX_SAFE_INTEGER, "appliedHp"),
        resultingHp: integer(revive.resultingHp, 1, Number.MAX_SAFE_INTEGER, "resultingHp"),
        logicalTimeMs: integer(revive.logicalTimeMs, 0, Number.MAX_SAFE_INTEGER, "logicalTimeMs"),
      };
    }),
  };
}

function parseActivityPage(value: unknown): HuntActivityPage {
  const row = object(value, "Hunt activity page");
  if (row.schemaVersion !== "pokenexus.hunt-activity-page.v1" || !Array.isArray(row.records) || row.records.length > 64) {
    throw new Error("Invalid Hunt activity page");
  }
  return {
    huntId: uuid(row.huntId, "huntId"),
    records: row.records.map(parseActivityRecord),
    nextCursor: row.nextCursor === null ? null : decimal(row.nextCursor, "activity cursor"),
  };
}

async function boundedJson(response: Response, limit = MAX_ERROR_BYTES): Promise<unknown> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > limit) throw new Error("Response body exceeded client budget");
  return JSON.parse(text) as unknown;
}

async function boundedBytes(response: Response, limit: number): Promise<Uint8Array> {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength !== null && /^\d+$/u.test(contentLength) && Number(contentLength) > limit) {
    throw new Error("Response body exceeded client budget");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new Error("Response body exceeded client budget");
  return bytes;
}

export class HuntApi {
  constructor(private readonly transport: Fetcher = (input, init) => fetch(input, init)) {}

  private async read<T>(path: string, parser: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
    const response = await this.transport(path, {
      method: "GET",
      credentials: "include",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      let code = "invalid_response";
      try {
        const body = object(await boundedJson(response), "error response");
        if (typeof body.error === "string") code = body.error;
      } catch {
        // Status remains authoritative when the error body is malformed/oversized.
      }
      applyResponsePolicy(response.status, code);
      throw new HuntApiError(response.status, code);
    }
    return parser(await boundedJson(response, 512 * 1024));
  }

  private async mutate(
    path: string,
    csrfToken: string,
    idempotencyKey: string,
    body: unknown,
    parseSuccess: (value: unknown) => void,
  ): Promise<HuntMutationResult> {
    if (!csrfToken || !UUID_RE.test(idempotencyKey)) throw new Error("Invalid Hunt command identity");
    const response = await this.transport(path, {
      method: path.includes("auto-") ? "PUT" : "POST",
      credentials: "include",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const parsed = await boundedJson(response, 64 * 1024).catch(() => null);
    if (!response.ok) {
      const code = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        && typeof (parsed as Record<string, unknown>).error === "string"
        ? (parsed as Record<string, unknown>).error as string
        : "invalid_response";
      applyResponsePolicy(response.status, code);
      throw new HuntApiError(response.status, code);
    }
    if (response.status === 200) {
      parseSuccess(parsed);
      return { kind: "complete" };
    }
    if (response.status !== 202) throw new Error("Unexpected Hunt command success status");
    const row = object(parsed, "in-progress command response");
    const progress = object(row.progress, "command progress");
    if (row.status !== "in_progress") throw new Error("Unexpected 202 Hunt command response");
    return {
      kind: "in_progress",
      logicalTimeMs: decimal(progress.logicalTimeMs, "logicalTimeMs"),
      targetLogicalTimeMs: decimal(progress.targetLogicalTimeMs, "targetLogicalTimeMs"),
    };
  }

  async reconcileHunt(
    csrfToken: string,
    idempotencyKey: string,
    huntId: string,
    mode: HuntReconciliationMode,
    signal?: AbortSignal,
  ): Promise<HuntMutationResult> {
    if (!csrfToken || !UUID_RE.test(idempotencyKey)) throw new Error("Invalid Hunt reconciliation identity");
    if (mode !== "online" && mode !== "return") throw new Error("Invalid Hunt reconciliation mode");
    const id = uuid(huntId, "huntId");
    const transportKind = mode === "return" ? "claim" : "checkpoint";
    const response = await this.transport(`/player/hunts/${encodeURIComponent(id)}/${transportKind}`, {
      method: "POST",
      credentials: "include",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": idempotencyKey,
      },
      body: "{}",
      signal,
    });
    const parsed = await boundedJson(response, 128 * 1024).catch(() => null);
    if (!response.ok) {
      const code = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        && typeof (parsed as Record<string, unknown>).error === "string"
        ? (parsed as Record<string, unknown>).error as string
        : "invalid_response";
      applyResponsePolicy(response.status, code);
      throw new HuntApiError(response.status, code);
    }
    if (response.status === 202) {
      const row = object(parsed, "Hunt reconciliation response");
      const progress = object(row.progress, "Hunt reconciliation progress");
      if (row.status !== "in_progress") throw new Error("Unexpected 202 Hunt reconciliation response");
      return {
        kind: "in_progress",
        logicalTimeMs: decimal(progress.logicalTimeMs, "logicalTimeMs"),
        targetLogicalTimeMs: decimal(progress.targetLogicalTimeMs, "targetLogicalTimeMs"),
      };
    }
    if (response.status !== 200) throw new Error("Unexpected Hunt reconciliation success status");
    if (mode === "return") {
      const row = object(parsed, "return reconciliation response");
      parseHuntState(row.state);
      const effects = object(row.effects, "return reconciliation effects");
      decimal(effects.playerExperience, "playerExperience");
      if (!Array.isArray(effects.pokemonExperience) || effects.pokemonExperience.length > 6 || !Array.isArray(effects.items) || effects.items.length > 128) {
        throw new Error("Invalid return reconciliation effects");
      }
      effects.pokemonExperience.forEach((entry) => {
        const xp = object(entry, "return Pokémon XP");
        uuid(xp.pokemonInstanceId, "pokemonInstanceId");
        decimal(xp.amount, "XP amount");
      });
      effects.items.forEach((entry) => {
        const item = object(entry, "return item effect");
        opaque(item.itemId, "itemId");
        decimal(item.quantity, "item quantity");
      });
      const capture = object(effects.automaticCaptureSummary, "automatic Capture summary");
      for (const key of ["attempts", "successes", "failures", "closedNoEligibleBall", "shinySuccesses"] as const) {
        decimal(capture[key], `automatic Capture ${key}`);
      }
    } else {
      parseHuntState(parsed);
    }
    return { kind: "complete" };
  }

  state(signal?: AbortSignal): Promise<HuntState> {
    return this.read("/player/hunts/state", parseHuntState, signal);
  }

  playerIdentity(signal?: AbortSignal): Promise<string> {
    return this.read("/player/profile", (value) => uuid(object(value, "profile").playerId, "playerId"), signal);
  }

  captureBalls(signal?: AbortSignal): Promise<CaptureBallCatalog> {
    return this.read("/player/hunts/capture-balls", (value) => {
      const row = object(value, "capture Ball catalog");
      if (!Array.isArray(row.balls) || row.balls.length > 16) throw new Error("Invalid capture Ball catalog");
      return {
        ballAuthorityVersion: opaque(row.ballAuthorityVersion, "ballAuthorityVersion"),
        balls: row.balls.map((entry) => {
          const ball = object(entry, "capture Ball");
          return {
            itemId: opaque(ball.itemId, "itemId"),
            powerQuarterUnits: integer(ball.powerQuarterUnits, 1, Number.MAX_SAFE_INTEGER, "capture power"),
            premium: bool(ball.premium, "premium"),
          };
        }),
      };
    }, signal);
  }

  autoCapturePolicy(signal?: AbortSignal): Promise<AutoCapturePolicy> {
    return this.read("/player/hunts/auto-capture-policy", parseAutoCapturePolicy, signal);
  }

  autoPotionPolicy(signal?: AbortSignal): Promise<AutoPotionPolicy> {
    return this.read("/player/hunts/auto-potion-policy", parseAutoPotionPolicy, signal);
  }

  autoRevivePolicy(signal?: AbortSignal): Promise<AutoRevivePolicy> {
    return this.read("/player/hunts/auto-revive-policy", parseAutoRevivePolicy, signal);
  }

  activity(huntId: string, cursor?: string, signal?: AbortSignal): Promise<HuntActivityPage> {
    const id = uuid(huntId, "huntId");
    if (cursor !== undefined) decimal(cursor, "activity cursor");
    return this.read(
      `/player/hunts/${encodeURIComponent(id)}/activity?limit=64${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      (value) => {
        const page = parseActivityPage(value);
        if (page.huntId !== id) throw new Error("Hunt activity page identity does not match requested Hunt");
        return page;
      },
      signal,
    );
  }

  teamsPage(cursor?: string, signal?: AbortSignal): Promise<SavedTeamsPage> {
    if (cursor !== undefined && (!cursor || cursor.length > 4096)) throw new Error("Invalid Team cursor");
    return this.read(`/player/teams?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, (value) => {
      const row = object(value, "Teams page");
      if (!Array.isArray(row.teams) || row.teams.length > 100) throw new Error("Invalid Teams page");
      return {
        teams: row.teams.map((entry) => {
          const team = object(entry, "Team");
          return { teamId: uuid(team.teamId, "teamId"), rowVersion: decimal(team.rowVersion, "rowVersion") };
        }),
        nextCursor: row.nextCursor === null ? null : opaque(row.nextCursor, "Teams cursor"),
      };
    }, signal);
  }

  teamDetail(teamId: string, signal?: AbortSignal): Promise<SavedTeamDetail> {
    const id = uuid(teamId, "teamId");
    return this.read(`/player/teams/${encodeURIComponent(id)}`, (value) => {
      const row = object(value, "Team detail");
      return {
        teamId: uuid(row.teamId, "teamId"),
        pokemonInstanceIds: stringList(row.pokemonInstanceIds, 6, "Team members").map((entry) => uuid(entry, "pokemonInstanceId")),
        rowVersion: decimal(row.rowVersion, "rowVersion"),
      };
    }, signal);
  }

  pokemon(pokemonInstanceId: string, signal?: AbortSignal): Promise<OwnedPokemonPreview> {
    const id = uuid(pokemonInstanceId, "pokemonInstanceId");
    return this.read(`/player/pokemon/${encodeURIComponent(id)}`, (value) => {
      const row = object(value, "Pokémon");
      const moves = object(row.moveLoadout, "Move loadout");
      return {
        pokemonInstanceId: uuid(row.pokemonInstanceId, "pokemonInstanceId"),
        speciesId: opaque(row.speciesId, "speciesId"),
        level: integer(row.level, 1, 1_000_000, "level"),
        selectedAbilityId: row.selectedAbilityId === null ? null : opaque(row.selectedAbilityId, "abilityId"),
        moveIds: stringList(moves.moveIds, 4, "Moves"),
      };
    }, signal);
  }

  inventoryPage(cursor?: string, signal?: AbortSignal): Promise<InventoryPage> {
    if (cursor !== undefined && (!cursor || cursor.length > 4096)) throw new Error("Invalid Inventory cursor");
    return this.read(`/player/inventory?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, (value) => {
      const row = object(value, "Inventory page");
      if (!Array.isArray(row.entries) || row.entries.length > 100) throw new Error("Invalid Inventory page");
      const entries = row.entries.map((entry) => {
        const item = object(entry, "Inventory entry");
        return { itemId: opaque(item.itemId, "itemId"), quantity: decimal(item.quantity, "quantity") };
      });
      if (new Set(entries.map(({ itemId }) => itemId)).size !== entries.length) {
        throw new Error("Invalid Inventory page: duplicate item identity");
      }
      return {
        rowVersion: decimal(row.rowVersion, "rowVersion"),
        entries,
        nextCursor: row.nextCursor === null ? null : opaque(row.nextCursor, "Inventory cursor"),
      };
    }, signal);
  }

  async publishedHuntChoices(signal?: AbortSignal): Promise<PublishedHuntChoices> {
    const descriptor = await this.read(
      "/player/hunts/catalog-release",
      parsePublishedHuntReleaseDescriptor,
      signal,
    );
    return loadPublishedHuntChoices({
      read: async (path) => {
        if (!/^version-[0-9a-f]{64}\/(?:manifest\.json|catalogs\/(?:zones|hunts|encounter-definitions)\.json)$/u.test(path)) {
          throw new Error("Unexpected published Hunt artifact path");
        }
        const response = await this.transport(`${descriptor.artifactBasePath}${path}`, {
          method: "GET",
          credentials: "include",
          redirect: "error",
          headers: { Accept: "application/json" },
          signal,
        });
        if (!response.ok) {
          let code = "invalid_response";
          try {
            const body = object(await boundedJson(response), "catalog error");
            if (typeof body.error === "string") code = body.error;
          } catch {
            // Preserve status.
          }
          applyResponsePolicy(response.status, code);
          throw new HuntApiError(response.status, code);
        }
        return boundedBytes(response, MAX_CATALOG_BYTES);
      },
    }, descriptor);
  }

  start(csrf: string, key: string, body: { huntDefinitionId: string; teamId: string }): Promise<HuntMutationResult> {
    opaque(body.huntDefinitionId, "huntDefinitionId");
    uuid(body.teamId, "teamId");
    return this.mutate("/player/hunts/start", csrf, key, body, (value) => {
      const state = parseHuntState(value);
      if (!state.activeHunt || state.activeHunt.huntDefinitionId !== body.huntDefinitionId) {
        throw new Error("Start result does not identify the requested active Hunt");
      }
    });
  }

  retreat(csrf: string, key: string, huntId: string): Promise<HuntMutationResult> {
    const id = uuid(huntId, "huntId");
    return this.mutate(`/player/hunts/${encodeURIComponent(id)}/retreat`, csrf, key, {}, (value) => {
      const row = object(value, "Retreat result");
      if (row.status !== "terminal") throw new Error("Invalid Retreat result status");
      if (row.terminalReason === "draw" || row.terminalReason === "opponent_victory") {
        throw new Error(`Historical Retreat replay returned ${row.terminalReason}; refresh authoritative state before discarding the saved correlation`);
      }
      if (row.terminalReason !== "retreat" && row.terminalReason !== "no_living") {
        throw new Error("Invalid Retreat terminal reason");
      }
      if (dateOrNull(row.recoveryReadyAt) === null) throw new Error("Retreat result is missing recoveryReadyAt");
    });
  }

  healAtPokeCenter(
    csrf: string,
    key: string,
    teamId: string,
    expectedPokemonInstanceIds: readonly string[],
  ): Promise<HuntMutationResult> {
    const selectedTeamId = uuid(teamId, "teamId");
    if (expectedPokemonInstanceIds.length === 0 || expectedPokemonInstanceIds.length > 6) {
      throw new Error("PokéCenter requires the complete selected Team roster");
    }
    const expectedPokemonIds = expectedPokemonInstanceIds.map((entry) => uuid(entry, "expected Pokémon instance ID"));
    const expectedPokemonIdSet = new Set(expectedPokemonIds);
    if (expectedPokemonIdSet.size !== expectedPokemonIds.length) throw new Error("Duplicate expected PokéCenter Team member");
    return this.mutate("/player/pokecenter/heal", csrf, key, { teamId: selectedTeamId }, (value) => {
      const row = object(value, "PokéCenter result");
      if (
        uuid(row.teamId, "teamId") !== selectedTeamId
        || !Array.isArray(row.vitality)
        || row.vitality.length !== expectedPokemonIds.length
      ) {
        throw new Error("Invalid PokéCenter result");
      }
      const pokemonIds = new Set<string>();
      row.vitality.forEach((entry) => {
        const vitality = object(entry, "PokéCenter vitality");
        const pokemonInstanceId = uuid(vitality.pokemonInstanceId, "pokemonInstanceId");
        if (pokemonIds.has(pokemonInstanceId) || !expectedPokemonIdSet.has(pokemonInstanceId)) {
          throw new Error("PokéCenter vitality result does not match the selected Team roster");
        }
        pokemonIds.add(pokemonInstanceId);
        const currentHp = integer(vitality.currentHp, 0, Number.MAX_SAFE_INTEGER, "currentHp");
        const maxHp = integer(vitality.maxHp, 1, Number.MAX_SAFE_INTEGER, "maxHp");
        if (currentHp !== maxHp || vitality.vitality !== "conscious") {
          throw new Error("Invalid PokéCenter vitality result");
        }
        decimal(vitality.vitalityRowVersion, "vitalityRowVersion");
      });
      dateOrNull(row.recoveryReadyAt);
    });
  }

  replaceCapturePolicy(csrf: string, key: string, body: unknown): Promise<HuntMutationResult> {
    return this.mutate("/player/hunts/auto-capture-policy", csrf, key, body, (value) => {
      const row = object(value, "Capture policy result");
      parseAutoCapturePolicy(row.policy);
      parseEffectiveAt(row.effectiveAt);
    });
  }

  replacePotionPolicy(csrf: string, key: string, body: unknown): Promise<HuntMutationResult> {
    return this.mutate("/player/hunts/auto-potion-policy", csrf, key, body, (value) => {
      const row = object(value, "Potion policy result");
      parseAutoPotionPolicy(row.policy);
      parseEffectiveAt(row.effectiveAt);
    });
  }

  replaceRevivePolicy(csrf: string, key: string, body: unknown): Promise<HuntMutationResult> {
    return this.mutate("/player/hunts/auto-revive-policy", csrf, key, body, (value) => {
      const row = object(value, "Revive policy result");
      parseAutoRevivePolicy(row.policy);
      parseEffectiveAt(row.effectiveAt);
    });
  }
}
