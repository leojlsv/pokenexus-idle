import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { COMBAT_PRESENTATION_FIXTURE_V1 } from "@pokenexus/game-protocol/testing";
import { PixiCombatSurface } from "./combat-pixi/PixiCombatSurface";
import "./app.css";
import "./pixi-preview.css";

function Preview() {
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(true);
  const total = COMBAT_PRESENTATION_FIXTURE_V1.continuations.length;
  return (
    <main className="combat-preview">
      <header>
        <p className="combat-preview__eyebrow">POKENEXUS · VISUAL PREVIEW</p>
        <h1>TASK-030 · Pixi</h1>
        <p>Prévia isolada do canvas real, com fixture projetada do motor. Não é uma Hunt ativa.</p>
      </header>
      <div className="combat-preview__controls" role="group" aria-label="Controles de reprodução">
        <button type="button" onClick={() => setStep(0)} disabled={step === 0}>Reiniciar</button>
        <button type="button" onClick={() => setStep(Math.min(total, step + 1))} disabled={step === total}>Próximo evento</button>
        <button type="button" onClick={() => setStep(total)} disabled={step === total}>Mostrar todos</button>
        <button type="button" onClick={() => setMounted(value => !value)}>{mounted ? "Desmontar canvas" : "Montar canvas"}</button>
        <label><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Movimento reduzido</label>
        <span role="status">Segmentos: {step} / {total}</span>
      </div>
      {mounted ? (
        <PixiCombatSurface
          bootstrap={COMBAT_PRESENTATION_FIXTURE_V1.bootstrap}
          continuations={COMBAT_PRESENTATION_FIXTURE_V1.continuations.slice(0, step)}
          reducedMotion={reducedMotion}
          fallback={<div className="combat-preview__fallback">
            <strong>Resumo acessível</strong>
            <p>Seu Pokémon: species:owned (HP 30/30 inicial); reserva: species:owned-reserve.</p>
            <p>Selvagem: species:wild (HP oculto). {step ? "Golpe shock aplicado; alvo imune." : "Combate iniciado."}</p>
          </div>}
        />
      ) : <p role="status">Canvas desmontado para inspeção do ciclo de vida.</p>}
      <footer>Escopo desta fixture: início, golpe e imunidade. KO/substituição são cobertos por testes do motor, não por esta prévia.</footer>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Preview root missing");
createRoot(root).render(<StrictMode><Preview /></StrictMode>);
