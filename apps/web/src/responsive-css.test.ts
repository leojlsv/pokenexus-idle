/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./app.css", import.meta.url)), "utf8");
const inventoryCss = readFileSync(fileURLToPath(new URL("./inventory-page.css", import.meta.url)), "utf8");

describe("small-screen shell CSS contract", () => {
  it("keeps the bottom navigation as four shrinkable equal columns", () => {
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(css).toContain(".primary-nav a { min-width: 0;");
  });

  it("prevents intrinsic shell width from creating horizontal page overflow", () => {
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("body { margin: 0; min-width: 0;");
    expect(css).toContain(".app-shell { min-width: 0;");
    expect(css).toContain(".main-content { min-width: 0;");
  });

  it("de-emphasizes session status on small screens while restoring it on large layouts", () => {
    expect(css).toContain(".topbar__meta > span { display: none; }");
    expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.topbar__meta > span \{ display: inline; \}/);
  });

  it("keeps Inventory cards shrinkable and exact long identifiers/quantities wrappable", () => {
    expect(css).toContain("--target-min: 44px");
    expect(css).toContain(".button { min-height: var(--target-min);");
    expect(inventoryCss).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(inventoryCss).toContain(".inventory-item-id { min-width: 0; overflow-wrap: anywhere;");
    expect(inventoryCss).toMatch(/\.inventory-quantity \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
    expect(inventoryCss).toMatch(/@media \(min-width: 640px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  });
});
