import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createRngState,
  initializeBattle,
  resolveCombatStimulus,
  type BattleInitInput,
  type CombatEventSchemaVersion,
  type CombatantId,
  type EffectId,
  type MoveId,
  type ResolvedCombatContext,
  type TypeId,
} from "@pokenexus/game-core";
import {
  projectCombatPresentationBootstrapV1,
  projectCombatPresentationContinuationV1,
  type CombatPresentationBootstrapEnvelopeV1,
  type CombatPresentationContinuationContextV1,
  type CombatPresentationEventV1,
} from "@pokenexus/game-protocol";
import { COMBAT_PRESENTATION_FIXTURE_V1 } from "@pokenexus/game-protocol/testing";
import { CardCombatRenderer } from "../combat-card";
import { mountAsyncPixiRuntime } from "./lifecycle";
import {
  PIXI_COMBAT_CUE_QUEUE_LIMIT,
  buildPixiCombatModel,
  capPixiVisualCues,
  eventToPixiCue,
  visualCueDurationMs,
  type PixiVisualCue,
} from "./model";
import { PixiCombatSurface } from "./PixiCombatSurface";
import {
  createPixiCombatRuntime,
  type PixiCombatRuntimeEnvironment,
} from "./runtime";

const id = <T extends string>(value: string) => value as T;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createFakePixiHarness(options: { throwContainerConstruction?: boolean } = {}) {
  let tickerCallback: (() => void) | null = null;
  let resizeCallback: ResizeObserverCallback | null = null;
  let resizeFrameCallback: FrameRequestCallback | null = null;
  const labels: Array<{ text: string; style: Record<string, unknown>; y: number }> = [];
  const ticker = {
    maxFPS: 0,
    deltaMS: 16,
    add: vi.fn((callback: () => void) => {
      tickerCallback = callback;
    }),
    remove: vi.fn(),
  };
  const renderer = {
    width: 320,
    height: 180,
    resize: vi.fn((width: number, height: number) => {
      renderer.width = width;
      renderer.height = height;
    }),
  };
  const applicationSpies = {
    init: vi.fn(async () => undefined),
    destroy: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    render: vi.fn(),
    ticker,
  };

  class FakeContainer {
    constructor() {
      if (options.throwContainerConstruction) throw new Error("container failed");
    }
    x = 0;
    y = 0;
    alpha = 1;
    scale = { set: vi.fn() };
    addChild = vi.fn();
    removeChild = vi.fn();
    destroy = vi.fn();
  }

  class FakeGraphics extends FakeContainer {
    circle() {
      return this;
    }
    fill() {
      return this;
    }
  }

  class FakeText extends FakeContainer {
    text: string;
    style: Record<string, unknown>;
    anchor = { set: vi.fn() };
    constructor(options: { text: string; style: Record<string, unknown> }) {
      super();
      this.text = options.text;
      this.style = { ...options.style };
      labels.push(this);
    }
  }

  class FakeApplication {
    ticker = ticker;
    canvas = {
      setAttribute: vi.fn(),
      style: {} as Record<string, string>,
    };
    stage = { addChild: vi.fn() };
    renderer = renderer;
    init = applicationSpies.init;
    destroy = applicationSpies.destroy;
    start = applicationSpies.start;
    stop = applicationSpies.stop;
    render = applicationSpies.render;
  }

  const observer = {
    observe: vi.fn(),
    disconnect: vi.fn(),
  };
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    resizeFrameCallback = callback;
    return 41;
  });
  const cancelFrame = vi.fn();
  const environment: PixiCombatRuntimeEnvironment = {
    loadPixi: async () => ({
      Application: FakeApplication,
      Container: FakeContainer,
      Graphics: FakeGraphics,
      Text: FakeText,
    }) as unknown as typeof import("pixi.js"),
    createResizeObserver(callback) {
      resizeCallback = callback;
      return observer;
    },
    requestFrame,
    cancelFrame,
  };

  return {
    environment,
    observer,
    requestFrame,
    cancelFrame,
    getApplication: () => applicationSpies,
    getLabels: () => labels,
    fireResize: () => {
      if (!resizeCallback) throw new Error("resize observer was not created");
      resizeCallback([], {} as ResizeObserver);
    },
    flushResizeFrame: () => {
      if (!resizeFrameCallback) throw new Error("resize frame was not scheduled");
      resizeFrameCallback(0);
      resizeFrameCallback = null;
    },
    fireTick: () => {
      if (!tickerCallback) throw new Error("ticker callback was not registered");
      tickerCallback();
    },
  };
}

function engineProjectedScenario() {
  const context: ResolvedCombatContext = {
    gameDataVersion: id("data"),
    rulesVersion: id("rules"),
    combatEventSchemaVersion: id<CombatEventSchemaVersion>("events-v1"),
    abilityRules: {},
    typeChart: { normal: { normal: 1 } },
    effectRules: {
      burn: {
        effectId: id<EffectId>("burn"),
        lifetimeScope: "battle",
        stackingPolicy: "replace",
        durationMs: 1_000,
      },
    },
    moveRules: {
      mark: {
        moveId: id<MoveId>("mark"),
        category: "status",
        targetScope: "self",
        moveCooldownMs: 2_000,
        accuracy: "always",
        effects: [{
          kind: "applyEffect",
          scope: "perResolvedTarget",
          target: "self",
          effectId: id<EffectId>("burn"),
        }],
      },
      knockout: {
        moveId: id<MoveId>("knockout"),
        typeId: id<TypeId>("normal"),
        category: "physical",
        targetScope: "singleEnemy",
        moveCooldownMs: 2_000,
        power: 100_000,
        accuracy: "always",
        criticalPolicy: "never",
      },
    },
  };
  const baseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
  const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const input: BattleInitInput = {
    battleId: id("battle:pixi"),
    context,
    deterministicState: { rng: createRngState(1) },
    sides: [
      {
        sideId: id("side:player"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("owned:a"), id<CombatantId>("owned:reserve")],
        initialActiveCombatantIds: [id<CombatantId>("owned:a")],
      },
      {
        sideId: id("side:wild"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("wild:a")],
        initialActiveCombatantIds: [id<CombatantId>("wild:a")],
      },
    ],
    combatants: [
      {
        combatantId: id<CombatantId>("owned:a"),
        speciesId: id("species:owned"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("normal")],
        startingHp: 20,
        moveLoadout: [id<MoveId>("mark")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { mark: 0 },
      },
      {
        combatantId: id<CombatantId>("owned:reserve"),
        speciesId: id("species:reserve"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("normal")],
        startingHp: 20,
        moveLoadout: [id<MoveId>("mark")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { mark: 0 },
      },
      {
        combatantId: id<CombatantId>("wild:a"),
        speciesId: id("species:wild"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("normal")],
        startingHp: 20,
        moveLoadout: [id<MoveId>("knockout")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { knockout: 0 },
      },
    ],
  };

  const initialized = initializeBattle(input);
  if (!initialized.accepted) throw new Error(initialized.reason);
  const bootstrap = projectCombatPresentationBootstrapV1({
    battleId: "battle:pixi",
    combatEventSchemaVersion: id<CombatEventSchemaVersion>("events-v1"),
    sides: [
      { sideId: "side:player", combatantIds: ["owned:a", "owned:reserve"], activeCombatantIds: ["owned:a"] },
      { sideId: "side:wild", combatantIds: ["wild:a"], activeCombatantIds: ["wild:a"] },
    ],
    participants: [
      { kind: "owned", combatantId: "owned:a", sideId: "side:player", pokemonInstanceId: "pokemon:a", speciesId: "species:owned", level: 10, shiny: false, currentHp: 20, maxHp: 20 },
      { kind: "owned", combatantId: "owned:reserve", sideId: "side:player", pokemonInstanceId: "pokemon:reserve", speciesId: "species:reserve", level: 10, shiny: false, currentHp: 20, maxHp: 20 },
      { kind: "wild", combatantId: "wild:a", sideId: "side:wild", speciesId: "species:wild", level: 10, shiny: false, state: "conscious" },
    ],
    events: initialized.events,
  });
  const project = (
    projectionContext: CombatPresentationContinuationContextV1,
    events: Parameters<typeof projectCombatPresentationContinuationV1>[0]["events"],
  ) => projectCombatPresentationContinuationV1({ context: projectionContext, events });

  const marked = resolveCombatStimulus(
    initialized.state,
    { kind: "useMove", actorId: id<CombatantId>("owned:a"), moveId: id<MoveId>("mark"), targetId: id<CombatantId>("owned:a") },
    initialized.deterministicState,
  );
  if (!marked.accepted) throw new Error(marked.reason);
  const markedProjection = project(bootstrap.continuationContext, marked.events);

  const knockedOut = resolveCombatStimulus(
    marked.state,
    { kind: "useMove", actorId: id<CombatantId>("wild:a"), moveId: id<MoveId>("knockout"), targetId: id<CombatantId>("owned:a") },
    marked.deterministicState,
  );
  if (!knockedOut.accepted) throw new Error(knockedOut.reason);
  const koProjection = project(markedProjection.continuationContext, knockedOut.events);

  const replacement = resolveCombatStimulus(
    knockedOut.state,
    { kind: "forcedReplacement", sideId: id("side:player"), combatantId: id<CombatantId>("owned:reserve") },
    knockedOut.deterministicState,
  );
  if (!replacement.accepted) throw new Error(replacement.reason);
  const replacementProjection = project(koProjection.continuationContext, replacement.events);

  return {
    bootstrap: bootstrap.envelope,
    continuations: [markedProjection.envelope, koProjection.envelope, replacementProjection.envelope],
  };
}

describe("Pixi combat renderer foundation", () => {
  it("builds visual state from the accepted shared fixture without wild HP numerics", () => {
    const result = buildPixiCombatModel(
      COMBAT_PRESENTATION_FIXTURE_V1.bootstrap,
      COMBAT_PRESENTATION_FIXTURE_V1.continuations,
    );
    const wild = result.model.entities.find(({ combatantId }) => combatantId === "combatant:wild");
    expect(wild?.vitality).toEqual({ visibility: "hidden", state: "conscious" });
    expect(JSON.stringify(wild)).not.toContain("currentHp");
    expect(JSON.stringify(wild)).not.toContain("maxHp");
    expect(result.cues.map(({ kind }) => kind)).toEqual(["move", "immune"]);
  });

  it("uses engine-produced effect, KO and forced-replacement events and invalidates stale owned HP", () => {
    const scenario = engineProjectedScenario();
    const result = buildPixiCombatModel(scenario.bootstrap, scenario.continuations);
    const owned = result.model.entities.find(({ combatantId }) => combatantId === "owned:a");
    const reserve = result.model.entities.find(({ combatantId }) => combatantId === "owned:reserve");
    expect(owned).toMatchObject({
      active: false,
      vitality: { visibility: "unavailable", state: "ko" },
      effects: [{ effectId: "burn", stacks: 1 }],
    });
    expect(reserve).toMatchObject({ active: true });
    expect(result.cues.some(({ kind }) => kind === "ko")).toBe(true);
    expect(result.cues.some(({ kind }) => kind === "activate")).toBe(true);
  });

  it("never includes HP amounts in visual cues and bounds the queue", () => {
    const hidden: CombatPresentationEventV1 = {
      kind: "DamageApplied",
      sequence: 7,
      combatTimeMs: 0,
      source: "move",
      actorId: "wild:a",
      moveId: "secret",
      targetId: "owned:a",
      hpChange: { visibility: "hidden" },
    };
    expect(eventToPixiCue(hidden)).toEqual({
      sequence: 7,
      kind: "damage",
      subjectId: "wild:a",
      targetId: "owned:a",
    });
    const many: PixiVisualCue[] = Array.from({ length: PIXI_COMBAT_CUE_QUEUE_LIMIT + 12 }, (_, index) => ({
      sequence: index + 1,
      kind: "effect",
    }));
    const capped = capPixiVisualCues(many);
    expect(capped).toHaveLength(PIXI_COMBAT_CUE_QUEUE_LIMIT);
    expect(capped[0]?.sequence).toBe(13);
    expect(visualCueDurationMs(true)).toBe(0);
    expect(visualCueDurationMs(false)).toBeGreaterThan(0);
  });

  it("can resynchronize owned current HP from a later explicitly exact consequence after hidden damage", () => {
    const bootstrap = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const continuation = {
      kind: "continuation",
      schemaVersion: bootstrap.schemaVersion,
      sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
      battleId: bootstrap.battleId,
      events: [
        {
          kind: "DamageApplied",
          sequence: 2,
          combatTimeMs: 10,
          source: "move",
          actorId: "combatant:wild",
          moveId: "hidden-hit",
          targetId: "combatant:owned",
          hpChange: { visibility: "hidden" },
        },
        {
          kind: "DamageApplied",
          sequence: 3,
          combatTimeMs: 20,
          source: "move",
          actorId: "combatant:owned-reserve",
          moveId: "owned-hit",
          targetId: "combatant:owned",
          hpChange: { visibility: "exact", amount: 3, resultingHp: 21 },
        },
      ],
    } as const;
    const result = buildPixiCombatModel(bootstrap, [continuation]);
    expect(result.model.entities.find(({ combatantId }) => combatantId === "combatant:owned")?.vitality).toEqual({
      visibility: "exact",
      state: "conscious",
      currentHp: 21,
      maxHp: 30,
    });
  });

  it("does not derive KO from exact resultingHp before authoritative CombatantKO arrives", () => {
    const bootstrap = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const exactZero = {
      kind: "continuation",
      schemaVersion: bootstrap.schemaVersion,
      sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
      battleId: bootstrap.battleId,
      events: [{
        kind: "DamageApplied",
        sequence: 2,
        combatTimeMs: 10,
        source: "move",
        actorId: "combatant:owned-reserve",
        moveId: "owned-hit",
        targetId: "combatant:owned",
        hpChange: { visibility: "exact", amount: 30, resultingHp: 0 },
      }],
    } as const;
    const beforeKo = buildPixiCombatModel(bootstrap, [exactZero]);
    expect(beforeKo.model.entities.find(({ combatantId }) => combatantId === "combatant:owned")?.vitality).toEqual({
      visibility: "exact",
      state: "conscious",
      currentHp: 0,
      maxHp: 30,
    });

    const ko = {
      kind: "continuation",
      schemaVersion: bootstrap.schemaVersion,
      sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
      battleId: bootstrap.battleId,
      events: [{ kind: "CombatantKO", sequence: 3, combatTimeMs: 10, combatantId: "combatant:owned" }],
    } as const;
    const afterKo = buildPixiCombatModel(bootstrap, [exactZero, ko]);
    expect(afterKo.model.entities.find(({ combatantId }) => combatantId === "combatant:owned")?.vitality).toEqual({
      visibility: "unavailable",
      state: "ko",
    });
  });

  it("destroys a late async runtime when the mount was already disposed", async () => {
    const pending = deferred<{ destroy: ReturnType<typeof vi.fn> }>();
    const ready = vi.fn();
    const mounted = mountAsyncPixiRuntime(() => pending.promise, ready);
    mounted.dispose();
    const runtime = { destroy: vi.fn() };
    pending.resolve(runtime);
    await flushMicrotasks();
    expect(ready).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys a ready runtime exactly once and supports a subsequent independent mount", async () => {
    const firstRuntime = { destroy: vi.fn() };
    const first = mountAsyncPixiRuntime(async () => firstRuntime, () => undefined);
    await flushMicrotasks();
    first.dispose();
    first.dispose();
    expect(firstRuntime.destroy).toHaveBeenCalledTimes(1);

    const secondRuntime = { destroy: vi.fn() };
    const second = mountAsyncPixiRuntime(async () => secondRuntime, () => undefined);
    await flushMicrotasks();
    expect(second.getRuntime()).toBe(secondRuntime);
    second.dispose();
    expect(secondRuntime.destroy).toHaveBeenCalledTimes(1);
  });

  it("rolls back an initialized Pixi application if post-init setup throws", async () => {
    const harness = createFakePixiHarness();
    const host = {
      clientWidth: 320,
      clientHeight: 180,
      appendChild: vi.fn(() => {
        throw new Error("append failed");
      }),
    } as unknown as HTMLElement;

    await expect(createPixiCombatRuntime(host, harness.environment)).rejects.toThrow("append failed");
    const app = harness.getApplication();
    expect(app.init).toHaveBeenCalledTimes(1);
    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(app.stop).toHaveBeenCalledTimes(1);
    expect(harness.observer.disconnect).not.toHaveBeenCalled();
  });

  it("rolls back if root scene construction fails after Pixi initialization", async () => {
    const harness = createFakePixiHarness({ throwContainerConstruction: true });
    const host = {
      clientWidth: 320,
      clientHeight: 180,
      appendChild: vi.fn(),
    } as unknown as HTMLElement;

    await expect(createPixiCombatRuntime(host, harness.environment)).rejects.toThrow("container failed");
    const app = harness.getApplication();
    expect(app.init).toHaveBeenCalledTimes(1);
    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(app.stop).toHaveBeenCalledTimes(1);
    expect(host.appendChild).not.toHaveBeenCalled();
  });

  it("owns and releases ResizeObserver, RAF, ticker and Pixi application resources exactly once", async () => {
    const harness = createFakePixiHarness();
    const host = {
      clientWidth: 320,
      clientHeight: 180,
      appendChild: vi.fn(),
    } as unknown as HTMLElement;
    const runtime = await createPixiCombatRuntime(host, harness.environment);
    const app = harness.getApplication();

    expect(app.init).toHaveBeenCalledWith(expect.objectContaining({
      autoStart: false,
      sharedTicker: false,
    }));
    expect(app.ticker.maxFPS).toBe(60);
    expect(harness.observer.observe).toHaveBeenCalledWith(host);
    harness.fireResize();
    expect(harness.requestFrame).toHaveBeenCalledTimes(1);

    runtime.destroy();
    runtime.destroy();
    expect(harness.observer.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.cancelFrame).toHaveBeenCalledWith(41);
    expect(app.ticker.remove).toHaveBeenCalledTimes(1);
    expect(app.destroy).toHaveBeenCalledTimes(1);
  });

  it("bounds full visual labels within their cell at narrow widths and recomputes wrapping on resize", async () => {
    const harness = createFakePixiHarness();
    const host = {
      clientWidth: 320,
      clientHeight: 288,
      appendChild: vi.fn(),
    } as unknown as HTMLElement;
    const runtime = await createPixiCombatRuntime(host, harness.environment);
    runtime.render(buildPixiCombatModel(COMBAT_PRESENTATION_FIXTURE_V1.bootstrap).model);

    expect(harness.getLabels()).toHaveLength(3);
    expect(harness.getLabels().map((label) => label.text)).toContain("species:owned-reserve");
    expect(harness.getLabels().every((label) =>
      label.style.wordWrap === true && label.style.breakWords === true &&
      label.style.wordWrapWidth === 64 && label.y === 42,
    )).toBe(true);

    const app = harness.getApplication();
    expect(app.render).toHaveBeenCalledTimes(1);
    (host as { clientWidth: number }).clientWidth = 640;
    harness.fireResize();
    harness.flushResizeFrame();
    expect(harness.getLabels().every((label) => label.style.wordWrapWidth === 144)).toBe(true);
    expect(app.render).toHaveBeenCalledTimes(2);
    runtime.destroy();
  });

  it("drops queued animation work synchronously when reduced motion becomes active", async () => {
    const harness = createFakePixiHarness();
    const host = {
      clientWidth: 320,
      clientHeight: 180,
      appendChild: vi.fn(),
    } as unknown as HTMLElement;
    const runtime = await createPixiCombatRuntime(host, harness.environment);
    const app = harness.getApplication();
    runtime.enqueue([{ sequence: 2, kind: "damage", targetId: "combatant:owned" }], false);
    expect(app.start).toHaveBeenCalledTimes(1);

    runtime.enqueue([], true);
    expect(app.stop).toHaveBeenCalledTimes(1);
    harness.fireTick();
    expect(app.stop).toHaveBeenCalledTimes(2);
    runtime.destroy();
  });

  it("keeps the DOM fallback in server markup without initializing Pixi", () => {
    const factory = vi.fn(async () => {
      throw new Error("effects do not run during SSR");
    });
    const html = renderToStaticMarkup(
      <PixiCombatSurface
        bootstrap={COMBAT_PRESENTATION_FIXTURE_V1.bootstrap}
        fallback={<div>Accessible card fallback</div>}
        runtimeFactory={factory}
      />,
    );
    expect(html).toContain("Accessible card fallback");
    expect(html).toContain('aria-hidden="true"');
    expect(factory).not.toHaveBeenCalled();
  });

  it("can present the full accessible Card combat content alongside the hidden visual canvas", () => {
    const html = renderToStaticMarkup(
      <PixiCombatSurface
        bootstrap={COMBAT_PRESENTATION_FIXTURE_V1.bootstrap}
        continuations={COMBAT_PRESENTATION_FIXTURE_V1.continuations}
        fallback={<CardCombatRenderer
          bootstrap={COMBAT_PRESENTATION_FIXTURE_V1.bootstrap}
          continuations={COMBAT_PRESENTATION_FIXTURE_V1.continuations}
        />}
      />,
    );

    expect(html).toContain('class="pixi-combat__visual" aria-hidden="true"');
    expect(html).toContain("HP hidden");
    expect(html).toContain("Combat events");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("<ol>");
    expect(html).not.toContain("combat-preview__fallback");
  });

  it("uses authoritative initialSides roster order rather than initialParticipants array order", () => {
    const original = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const reordered: CombatPresentationBootstrapEnvelopeV1 = {
      ...original,
      initialSides: original.initialSides.map((side) => side.sideId === "side:player"
        ? { ...side, combatantIds: ["combatant:owned-reserve", "combatant:owned"] }
        : side),
      initialParticipants: [
        original.initialParticipants[0],
        original.initialParticipants[1],
        original.initialParticipants[2],
      ],
    };
    const result = buildPixiCombatModel(reordered);
    expect(
      result.model.entities
        .filter(({ sideId }) => sideId === "side:player")
        .map(({ combatantId }) => combatantId),
    ).toEqual(["combatant:owned-reserve", "combatant:owned"]);
  });
});
