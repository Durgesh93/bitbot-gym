import { describe, it, expect } from "vitest";
import { loadScene } from "../../../src/world/scene.js";
import { createGeometry } from "../../../src/world/fields/geometry.js";

const build = d => { const s = loadScene(d); return { scene: s, g: createGeometry(s) }; };
const UP = -Math.PI / 2, DOWN = Math.PI / 2, RIGHT = 0;

describe("the geometry field", () => {
  it("measures to a wall straight ahead", () => {
    const { g } = build({ size: 2000 });
    expect(g.raycast({ x: 1000, y: 1000 }, UP)).toBeCloseTo(1000, -1);
  });

  it("loses the echo off a really glancing wall, as a real ping does", () => {
    const { g } = build({ size: 2000 });
    // almost parallel to the top wall: past about 75 degrees nothing comes back
    expect(g.raycast({ x: 1000, y: 40 }, -0.1)).toBe(Infinity);
    expect(g.raycast({ x: 1000, y: 40 }, UP)).toBeLessThan(100);
  });

  it("finds furniture before the wall behind it", () => {
    const { g } = build({ size: 2000, furniture: [{ name: "box", x: 900, y: 500 }] });
    const d = g.raycast({ x: 1000, y: 1500 }, UP);
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(800);
  });

  it("sees nothing out there when the scene has no walls", () => {
    const { g } = build({ size: 2000, walls: false });
    expect(g.raycast({ x: 1000, y: 1000 }, UP)).toBe(Infinity);
  });

  it("hits another robot standing in the way", () => {
    const { g } = build({ size: 2000 });
    g.setBodies([{ id: 1, x: 1000, y: 700, r: 62 }]);
    expect(g.raycast({ x: 1000, y: 1500 }, UP)).toBeCloseTo(738, -1);   // 1500 - 700 - 62
  });

  it("is not blinded by its own body, which its sonar sits inside", () => {
    /* The sonar sticks out of the front of the chassis, so the ray starts
       inside the robot's own circle. Without the self rule every robot would
       read 0 cm for ever. */
    const { g } = build({ size: 2000 });
    g.setBodies([{ id: 2, x: 1000, y: 1500, r: 62 }]);
    expect(g.raycast({ x: 1000, y: 1500 }, UP, { self: 2 })).toBeCloseTo(1500, -1);
    expect(g.raycast({ x: 1000, y: 1500 }, UP)).toBe(0);                // but a neighbour sees it
  });

  it("stops looking at the reach it was given", () => {
    const { g } = build({ size: 4000 });
    expect(g.raycast({ x: 2000, y: 3000 }, UP, { reach: 500 })).toBe(Infinity);
  });

  it("pushes a body back inside a walled room", () => {
    const { g } = build({ size: 2000 });
    const hits = g.contacts({ id: 1, x: 20, y: 1000, r: 62 });
    expect(hits).toHaveLength(1);
    expect(hits[0].what).toBe("wall");
    expect(hits[0].to.x).toBe(62);
  });

  it("lets a body leave an open scene", () => {
    const { g } = build({ size: 2000, walls: false });
    expect(g.contacts({ id: 1, x: -500, y: 1000, r: 62 })).toEqual([]);
  });

  it("reports the furniture a body has driven into", () => {
    const { g } = build({ size: 2000, furniture: [{ name: "table", x: 900, y: 900 }] });
    const hits = g.contacts({ id: 1, x: 1100, y: 1050, r: 62 });
    expect(hits).toHaveLength(1);
    expect(hits[0].what).toBe("table");
    expect(hits[0].local).toBeTruthy();
  });

  it("collides two bodies that know only their ids", () => {
    /* The bug this pins: comparing owners with === made two bodies that both
       had no owner look like the same body, so they drove through each other. */
    const { g } = build({ size: 2000 });
    const a = { id: 1, x: 1000, y: 1000, r: 62 };
    const b = { id: 2, x: 1050, y: 1000, r: 62 };
    g.setBodies([a, b]);
    const hits = g.contacts(a).filter(c => c.what === "robot");
    expect(hits).toHaveLength(1);
    expect(hits[0].overlap).toBeCloseTo((124 - 50) / 2, 6);
  });

  it("never collides a body with itself, by id or by owner", () => {
    const { g } = build({ size: 2000 });
    const a = { id: 1, owner: "A", x: 1000, y: 1000, r: 62 };
    g.setBodies([a]);
    expect(g.contacts(a).filter(c => c.what === "robot")).toEqual([]);
    expect(g.contacts({ id: 1, x: 1000, y: 1000, r: 62 }).filter(c => c.what === "robot")).toEqual([]);
  });

  it("offers bodies as shadow casters alongside the furniture", () => {
    const { g } = build({ size: 2000, furniture: [{ name: "box", x: 100, y: 100 }] });
    expect(g.occluders()).toHaveLength(1);
    g.setBodies([{ id: 4, x: 500, y: 500, r: 62, z: 95 }]);
    const occ = g.occluders();
    expect(occ).toHaveLength(2);
    expect(occ[1].owner).toBe(4);
    expect(occ[1].box.w).toBe(124);
  });
});
