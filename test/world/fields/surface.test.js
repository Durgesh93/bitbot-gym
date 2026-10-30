import { describe, it, expect } from "vitest";
import { loadScene, MATERIALS } from "../../../src/world/scene.js";
import { createSurface } from "../../../src/world/fields/surface.js";

const build = d => createSurface(loadScene(d));

describe("the surface field", () => {
  it("reports the ground the scene is made of", () => {
    const s = build({ ground: { material: "grass" } }).at({ x: 100, y: 100 });
    expect(s.material).toBe("grass");
    expect(s.mu).toBe(MATERIALS.grass.mu);
    expect(s.roll).toBe(MATERIALS.grass.roll);
    expect(s.dark).toBe(false);
  });

  it("finds a line under the sensor, and clear floor beside it", () => {
    const f = build({ lines: [{ from: [500, 1000], to: [1500, 1000], width: 30 }] });
    expect(f.at({ x: 1000, y: 1000 }).dark).toBe(true);
    expect(f.at({ x: 1000, y: 1014 }).dark).toBe(true);      // just inside the 30 mm stripe
    expect(f.at({ x: 1000, y: 1030 }).dark).toBe(false);
    expect(f.at({ x: 1600, y: 1000 }).dark).toBe(false);     // past the end of the stripe
  });

  it("makes the line much darker than the floor, which is what a sensor sees", () => {
    const f = build({ lines: [{ from: [500, 1000], to: [1500, 1000], width: 30 }] });
    expect(f.at({ x: 1000, y: 1000 }).reflect).toBeLessThan(f.at({ x: 1000, y: 1200 }).reflect);
  });

  it("follows a line round a corner", () => {
    const f = build({
      lines: [{ from: [400, 400], to: [1600, 400], width: 40 },
              { from: [1600, 400], to: [1600, 1600], width: 40 }]
    });
    expect(f.at({ x: 1000, y: 400 }).dark).toBe(true);
    expect(f.at({ x: 1600, y: 1000 }).dark).toBe(true);
    expect(f.at({ x: 1000, y: 1000 }).dark).toBe(false);
  });

  it("says when a point is off the edge of the room", () => {
    const f = build({ size: 2000 });
    expect(f.at({ x: 100, y: 100 }).inside).toBe(true);
    expect(f.at({ x: -100, y: 100 }).inside).toBe(false);
  });
});
