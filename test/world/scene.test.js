import { describe, it, expect } from "vitest";
import { loadScene, MATERIALS, CATALOGUE } from "../../src/world/scene.js";

describe("loading a scene", () => {
  it("fills in everything a bare scene left out", () => {
    const s = loadScene({});
    expect(s.name).toBe("Room");
    expect(s.size).toBe(2000);
    expect(s.walls).toBe(true);
    expect(s.ground.material).toBe("lino");
    expect(s.sun).toBe(null);
    expect(s.start).toHaveLength(1);
  });

  it("takes nothing at all", () => {
    expect(() => loadScene()).not.toThrow();
  });

  it("gives the ground the physics of its material", () => {
    const s = loadScene({ ground: { material: "grass" } });
    expect(s.ground.mu).toBe(MATERIALS.grass.mu);
    expect(s.ground.roll).toBe(MATERIALS.grass.roll);
    expect(s.ground.roll).toBeGreaterThan(MATERIALS.lino.roll);   // grass drags more
  });

  it("gives a named piece of furniture its size and reflectance from the catalogue", () => {
    const s = loadScene({ furniture: [{ name: "whiteboard", x: 10, y: 20 }] });
    expect(s.furniture[0].w).toBe(CATALOGUE.whiteboard.w);
    expect(s.furniture[0].reflect).toBe(CATALOGUE.whiteboard.reflect);
  });

  it("lets a scene override anything the catalogue says", () => {
    const s = loadScene({ furniture: [{ name: "box", x: 10, y: 20, w: 999, reflect: 0.01 }] });
    expect(s.furniture[0].w).toBe(999);
    expect(s.furniture[0].reflect).toBe(0.01);
  });

  it("gives a lamp its kind and leaves it switched on", () => {
    const s = loadScene({ lamps: [{ x: 1, y: 2 }] });
    expect(s.lamps[0].kind).toBe("ceiling");
    expect(s.lamps[0].on).toBe(true);
  });

  it("complains in plain words about a floor it has never heard of", () => {
    expect(() => loadScene({ ground: { material: "jelly" } }))
      .toThrow(/not a material I know/);
  });

  it("complains about a room smaller than the robot", () => {
    expect(() => loadScene({ size: 50 })).toThrow(/smaller than the robot/);
  });

  it("complains about a sun below the horizon or past the zenith", () => {
    expect(() => loadScene({ sun: { elevation: 0 } })).toThrow(/between 0 and 90/);
    expect(() => loadScene({ sun: { elevation: 120 } })).toThrow(/between 0 and 90/);
    expect(() => loadScene({ sun: { elevation: 30 } })).not.toThrow();
  });

  it("complains about furniture with nowhere to stand", () => {
    expect(() => loadScene({ furniture: [{ name: "chair" }] })).toThrow(/nowhere to stand/);
  });

  it("complains about a thing with no size that is not in the catalogue", () => {
    expect(() => loadScene({ furniture: [{ name: "spaceship", x: 1, y: 2 }] })).toThrow(/no size/);
  });

  it("complains about a lamp that is neither ceiling nor floor", () => {
    expect(() => loadScene({ lamps: [{ x: 1, y: 2, kind: "candle" }] }))
      .toThrow(/ceiling or floor/);
  });

  it("complains about a line with only one end", () => {
    expect(() => loadScene({ lines: [{ from: [0, 0] }] })).toThrow(/a from and a to/);
  });

  it("never hands back the object it was given, so a scene file cannot be edited by accident", () => {
    const data = { furniture: [{ name: "box", x: 1, y: 2 }], start: [{ x: 5, y: 6 }] };
    const s = loadScene(data);
    s.furniture[0].x = 999;
    s.start[0].x = 999;
    expect(data.furniture[0].x).toBe(1);
    expect(data.start[0].x).toBe(5);
  });
});
