import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CombatPresentationBootstrapEnvelopeV1,
  CombatPresentationContinuationEnvelopeV1,
} from "@pokenexus/game-protocol";
import { mountAsyncPixiRuntime } from "./lifecycle";
import { buildPixiCombatModel } from "./model";
import { createPixiCombatRuntime, type PixiCombatRuntime } from "./runtime";
import "./pixi-combat.css";

export function PixiCombatSurface({
  bootstrap,
  continuations = [],
  fallback,
  reducedMotion = false,
  runtimeFactory = createPixiCombatRuntime,
}: {
  bootstrap: CombatPresentationBootstrapEnvelopeV1;
  continuations?: ReadonlyArray<CombatPresentationContinuationEnvelopeV1>;
  fallback: React.ReactNode;
  reducedMotion?: boolean;
  runtimeFactory?: (host: HTMLElement) => Promise<PixiCombatRuntime>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PixiCombatRuntime | null>(null);
  const lastCueSequenceRef = useRef(0);
  const [failed, setFailed] = useState(false);
  const presentation = useMemo(
    () => buildPixiCombatModel(bootstrap, continuations),
    [bootstrap, continuations],
  );
  const presentationRef = useRef(presentation);
  const reducedMotionRef = useRef(reducedMotion);
  presentationRef.current = presentation;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setFailed(false);
    lastCueSequenceRef.current = 0;
    const mounted = mountAsyncPixiRuntime(
      () => runtimeFactory(host),
      (runtime) => {
        runtimeRef.current = runtime;
        const latest = presentationRef.current;
        runtime.render(latest.model);
        const cues = latest.cues.filter(({ sequence }) => sequence > lastCueSequenceRef.current);
        runtime.enqueue(cues, reducedMotionRef.current);
        lastCueSequenceRef.current = latest.model.lastSequence;
      },
      () => setFailed(true),
    );
    return () => {
      runtimeRef.current = null;
      mounted.dispose();
    };
  }, [runtimeFactory, bootstrap.battleId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.render(presentation.model);
    const cues = presentation.cues.filter(({ sequence }) => sequence > lastCueSequenceRef.current);
    runtime.enqueue(cues, reducedMotion);
    lastCueSequenceRef.current = presentation.model.lastSequence;
  }, [presentation, reducedMotion]);

  return (
    <section className="pixi-combat" data-visual-failed={failed ? "true" : "false"}>
      <div className="pixi-combat__visual" ref={hostRef} aria-hidden="true" />
      <div className="pixi-combat__fallback">
        {failed ? <p role="status">Visual presentation unavailable. Card presentation remains available.</p> : null}
        {fallback}
      </div>
    </section>
  );
}
