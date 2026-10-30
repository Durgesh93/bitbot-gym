import { describe, it, expect } from "vitest";
import { loadScene } from "../../../src/world/scene.js";
import { createRadio } from "../../../src/world/fields/radio.js";

const build = d => createRadio(loadScene(d));

describe("the radio field", () => {
  it("reports about -42 dBm for two boards touching, as the real block does", () => {
    expect(build({}).strengthAt(0)).toBe(-42);
    expect(build({}).strengthAt(50)).toBe(-42);
  });

  it("weakens by about 20 dB for every ten times the distance", () => {
    const r = build({});
    expect(r.strengthAt(500) - r.strengthAt(50)).toBeCloseTo(-20, 0);
    expect(r.strengthAt(5000) - r.strengthAt(500)).toBeCloseTo(-20, 0);
  });

  it("never goes below the bottom of the scale", () => {
    expect(build({}).strengthAt(1e12)).toBe(-128);
  });

  it("says the same thing whichever board asks", () => {
    const r = build({});
    const a = { x: 0, y: 0 }, b = { x: 1500, y: 900 };
    expect(r.between(a, b)).toEqual(r.between(b, a));
  });

  it("reaches right across a classroom and gives up at 70 m", () => {
    const r = build({});
    expect(r.between({ x: 0, y: 0 }, { x: 2000, y: 2000 }).reaches).toBe(true);
    expect(r.between({ x: 0, y: 0 }, { x: 80000, y: 0 }).reaches).toBe(false);
  });

  it("lets a scene set its own range", () => {
    const r = build({ radioReach: 1000 });
    expect(r.between({ x: 0, y: 0 }, { x: 900, y: 0 }).reaches).toBe(true);
    expect(r.between({ x: 0, y: 0 }, { x: 1100, y: 0 }).reaches).toBe(false);
  });
});
