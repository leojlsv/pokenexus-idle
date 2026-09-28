import {
  PIXI_COMBAT_CUE_QUEUE_LIMIT,
  visualCueDurationMs,
  type PixiCombatModel,
  type PixiVisualCue,
} from "./model";

type PixiModule = typeof import("pixi.js");

interface ResizeObserverLike {
  observe(target: Element): void;
  disconnect(): void;
}

export interface PixiCombatRuntimeEnvironment {
  loadPixi(): Promise<PixiModule>;
  createResizeObserver(callback: ResizeObserverCallback): ResizeObserverLike;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
}

const DEFAULT_ENVIRONMENT: PixiCombatRuntimeEnvironment = {
  loadPixi: () => import("pixi.js"),
  createResizeObserver: (callback) => new ResizeObserver(callback),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

export interface PixiCombatRuntime {
  render(model: PixiCombatModel): void;
  enqueue(cues: ReadonlyArray<PixiVisualCue>, reducedMotion: boolean): void;
  destroy(): void;
}

export async function createPixiCombatRuntime(
  host: HTMLElement,
  environment: PixiCombatRuntimeEnvironment = DEFAULT_ENVIRONMENT,
): Promise<PixiCombatRuntime> {
  const { Application, Container, Graphics, Text } = await environment.loadPixi();
  const app = new Application();
  const width = Math.max(1, host.clientWidth || 1);
  const height = Math.max(1, host.clientHeight || 1);
  await app.init({
    width,
    height,
    antialias: false,
    autoStart: false,
    sharedTicker: false,
    backgroundAlpha: 0,
  });

  let observer: ResizeObserverLike | null = null;
  let resizeRaf: number | null = null;
  let tick: (() => void) | null = null;
  let destroyed = false;
  let animatedCombatantId: string | null = null;
  const entityViews = new Map<string, InstanceType<typeof Container>>();
  const entityLabels = new Map<string, InstanceType<typeof Text>>();
  const entityBasePresentation = new Map<string, { alpha: number; scale: number }>();
  const cueQueue: Array<{ cue: PixiVisualCue; remainingMs: number; durationMs: number }> = [];

  const resetAnimatedView = () => {
    if (animatedCombatantId === null) return;
    const view = entityViews.get(animatedCombatantId);
    const base = entityBasePresentation.get(animatedCombatantId);
    if (view && base) {
      view.alpha = base.alpha;
      view.scale.set(base.scale);
    }
    animatedCombatantId = null;
  };

  const destroyResources = () => {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    observer = null;
    if (resizeRaf !== null) environment.cancelFrame(resizeRaf);
    resizeRaf = null;
    if (tick !== null) app.ticker.remove(tick);
    app.stop();
    resetAnimatedView();
    cueQueue.length = 0;
    entityViews.clear();
    entityLabels.clear();
    entityBasePresentation.clear();
    app.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true, context: true },
    );
  };

  try {
    const scene = new Container();
    app.ticker.maxFPS = 60;
    app.canvas.setAttribute("aria-hidden", "true");
    app.canvas.setAttribute("tabindex", "-1");
    app.canvas.style.pointerEvents = "none";
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    host.appendChild(app.canvas);

    app.stage.addChild(scene);

    const layout = () => {
      const entries = [...entityViews];
      const spacing = app.renderer.width / Math.max(1, entries.length + 1);
      entries.forEach(([combatantId, view], index) => {
        view.x = spacing * (index + 1);
        view.y = app.renderer.height / 2;
        const label = entityLabels.get(combatantId);
        if (label) label.style.wordWrapWidth = Math.max(40, spacing - 16);
      });
    };

    const resize = () => {
      resizeRaf = null;
      if (destroyed) return;
      app.renderer.resize(Math.max(1, host.clientWidth || 1), Math.max(1, host.clientHeight || 1));
      layout();
      app.render();
    };
    observer = environment.createResizeObserver(() => {
      if (resizeRaf !== null) environment.cancelFrame(resizeRaf);
      resizeRaf = environment.requestFrame(resize);
    });
    observer.observe(host);

    tick = () => {
      resetAnimatedView();
      if (cueQueue.length === 0) {
        app.stop();
        return;
      }
      const elapsed = app.ticker.deltaMS;
      const next = cueQueue[0]!;
      next.remainingMs -= elapsed;
      if (next.remainingMs <= 0 || next.durationMs === 0) {
        cueQueue.shift();
        return;
      }

      const combatantId = next.cue.targetId ?? next.cue.subjectId;
      if (combatantId) {
        const view = entityViews.get(combatantId);
        const base = entityBasePresentation.get(combatantId);
        if (view && base) {
          const progress = 1 - Math.max(0, next.remainingMs) / next.durationMs;
          const pulse = Math.sin(Math.PI * progress);
          view.scale.set(base.scale + pulse * 0.08);
          view.alpha = Math.min(1, base.alpha + pulse * 0.15);
          animatedCombatantId = combatantId;
        }
      }
    };
    app.ticker.add(tick);

    const createEntityView = (combatantId: string, speciesId: string) => {
      const container = new Container();
      const marker = new Graphics().circle(0, 0, 28).fill({ color: 0x78d6df, alpha: 0.32 });
      const label = new Text({
        text: speciesId,
        style: {
          fill: 0xf2f5f5,
          fontSize: 14,
          align: "center",
          wordWrap: true,
          breakWords: true,
          wordWrapWidth: 80,
        },
      });
      label.anchor.set(0.5, 0);
      label.y = 42;
      container.addChild(marker, label);
      scene.addChild(container);
      entityLabels.set(combatantId, label);
      return container;
    };

    return {
      render(model) {
        if (destroyed) return;
        const knownIds = new Set(model.entities.map(({ combatantId }) => combatantId));
        for (const [combatantId, view] of entityViews) {
          if (!knownIds.has(combatantId)) {
            scene.removeChild(view);
            view.destroy({ children: true });
            entityViews.delete(combatantId);
            entityLabels.delete(combatantId);
            entityBasePresentation.delete(combatantId);
          }
        }
        for (const entity of model.entities) {
          let view = entityViews.get(entity.combatantId);
          if (!view) {
            view = createEntityView(entity.combatantId, entity.speciesId);
            entityViews.set(entity.combatantId, view);
          }
          const basePresentation = {
            alpha: entity.vitality.state === "ko" ? 0.35 : entity.active ? 1 : 0.65,
            scale: entity.active ? 1 : 0.88,
          };
          entityBasePresentation.set(entity.combatantId, basePresentation);
          view.alpha = basePresentation.alpha;
          view.scale.set(basePresentation.scale);
        }
        layout();
        app.render();
      },
      enqueue(cues, reducedMotion) {
        if (destroyed) return;
        if (reducedMotion) {
          cueQueue.length = 0;
          resetAnimatedView();
          app.stop();
          return;
        }
        for (const cue of cues) {
          const durationMs = visualCueDurationMs(false);
          cueQueue.push({ cue, remainingMs: durationMs, durationMs });
        }
        if (cueQueue.length > PIXI_COMBAT_CUE_QUEUE_LIMIT) {
          cueQueue.splice(0, cueQueue.length - PIXI_COMBAT_CUE_QUEUE_LIMIT);
        }
        if (cueQueue.length > 0) app.start();
      },
      destroy: destroyResources,
    };
  } catch (error) {
    try {
      destroyResources();
    } catch {
      // Preserve the original initialization/setup failure.
    }
    throw error;
  }
}
