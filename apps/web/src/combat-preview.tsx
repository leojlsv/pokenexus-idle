import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { COMBAT_PRESENTATION_FIXTURE_V1 } from "@pokenexus/game-protocol/testing";
import { CardCombatRenderer } from "./combat-card";
import "./app.css";
import "./combat-preview.css";

function Preview() {
  const [step, setStep] = useState(0);
  const total = COMBAT_PRESENTATION_FIXTURE_V1.continuations.length;
  return (
    <main className="combat-preview">
      <header>
        <p className="combat-preview__eyebrow">POKENEXUS · VISUAL PREVIEW</p>
        <h1>TASK-029 · Card</h1>
        <p>Prévia isolada do renderizador real, com fixture projetada do motor. Não é uma Hunt ativa.</p>
      </header>
      <div className="combat-preview__controls" role="group" aria-label="Controles de reprodução">
        <button type="button" onClick={() => setStep(0)} disabled={step === 0}>Reiniciar</button>
        <button type="button" onClick={() => setStep(Math.min(total, step + 1))} disabled={step === total}>Próximo evento</button>
        <button type="button" onClick={() => setStep(total)} disabled={step === total}>Mostrar todos</button>
        <span role="status">Segmentos reproduzidos: {step} / {total}</span>
      </div>
      <CardCombatRenderer
        bootstrap={COMBAT_PRESENTATION_FIXTURE_V1.bootstrap}
        continuations={COMBAT_PRESENTATION_FIXTURE_V1.continuations.slice(0, step)}
      />
      <footer>Escopo desta fixture: início, golpe e imunidade. KO/substituição são cobertos por testes do motor, não por esta prévia.</footer>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Preview root missing");
createRoot(root).render(<StrictMode><Preview /></StrictMode>);
