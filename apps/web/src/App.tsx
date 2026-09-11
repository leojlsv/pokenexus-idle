import { VERSION } from "pixi.js";
import { PACKAGE_NAME } from "@pokenexus/game-types";

/**
 * Minimal application shell. No gameplay UI, HUB or map rendering is
 * implemented here; this only validates the React + Vite + PixiJS +
 * workspace package wiring.
 */
export function App() {
  return (
    <main>
      <h1>PokeNexus</h1>
      <p>PixiJS {VERSION}</p>
      <p>{PACKAGE_NAME}</p>
    </main>
  );
}
