import { describe, it, expect } from "vitest";
import { loadScene } from "../../src/world/scene.js";
import { createMotion } from "../../src/world/motion.js";

const build = d => createMotion(loadScene(d));
/* dt must divide ms exactly, or the two runs being compared cover different
   amounts of time and it looks like a physics difference when it is not. */
const run = (m, ms, dt = 5) => {
  const n = ms / dt;
  if (n !== Math.round(n)) throw new Error(ms + " ms does not divide into " + dt + " ms steps");
  for (let i = 0; i < n; i++) m.step(dt);
};
const UP = -Math.PI / 2;

describe("motion, on matter.js", () => {
  describe("driving", () => {
    it("goes the distance the wheels were asked for", () => {
      /* The trap this pins: Matter's setVelocity takes units per its own
         1000/60 ms base delta, NOT per our step. Get it wrong and the robot
         crawls at three tenths speed with nothing to show why. */
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 300, y: 1000, h: 0, r: 62 });
      m.drive(1, 300, 300, 110);
      run(m, 1000);
      expect(m.bodyOf(1).x).toBeCloseTo(600, 0);
    });

    it("gives the same answer whatever the step length", () => {
      const go = dt => {
        const m = build({ size: 2000 });
        m.add({ id: 1, x: 300, y: 1000, h: 0, r: 62 });
        m.drive(1, 300, 300, 110);
        run(m, 1000, dt);
        return m.bodyOf(1).x;
      };
      expect(go(10)).toBeCloseTo(go(5), 0);
    });

    it("spins on the spot when the wheels fight each other", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 1000, y: 1000, h: 0, r: 62 });
      m.drive(1, 100, -100, 110);
      run(m, 1000);
      const b = m.bodyOf(1);
      expect(b.h * 180 / Math.PI).toBeCloseTo(104.2, 0);    // 200/110 rad/s
      expect(b.x).toBeCloseTo(1000, 0);                     // and stays put
    });

    it("curves when one wheel is faster than the other", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 1000, y: 1500, h: UP, r: 62 });
      m.drive(1, 300, 150, 110);
      run(m, 600);
      const b = m.bodyOf(1);
      expect(b.h).toBeGreaterThan(UP);                      // turned clockwise
      expect(b.y).toBeLessThan(1500);                       // and still made ground
    });
  });

  describe("bumping into things", () => {
    it("is stopped by a wall, a chassis-radius short of it", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 1800, y: 1000, h: 0, r: 62 });
      m.drive(1, 400, 400, 110);
      run(m, 2000);
      expect(m.bodyOf(1).x).toBeGreaterThan(1930);
      expect(m.bodyOf(1).x).toBeLessThan(1945);
      expect(m.contacts(1).map(c => c.what)).toContain("wall");
    });

    it("is stopped by the furniture, and says what it hit", () => {
      const m = build({ size: 2000, furniture: [{ name: "table", x: 800, y: 300 }] });
      m.add({ id: 1, x: 1000, y: 1400, h: UP, r: 62 });
      m.drive(1, 400, 400, 110);
      run(m, 3000);
      expect(m.bodyOf(1).y).toBeGreaterThan(630);           // the table's near edge is y = 630
      expect(m.contacts(1).map(c => c.what)).toContain("table");
    });

    it("shoves another robot out of the way", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 900, y: 1000, h: 0, r: 62 });
      m.add({ id: 2, x: 1030, y: 1000, h: 0, r: 62 });
      m.drive(1, 300, 300, 110);
      run(m, 500);
      expect(m.bodyOf(2).x).toBeGreaterThan(1030);
      expect(m.contacts(1).some(c => c.other === 2)).toBe(true);
    });

    it("never reports a robot touching itself", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 1000, y: 1000, h: 0, r: 62 });
      run(m, 100);
      expect(m.contacts(1).some(c => c.other === 1)).toBe(false);
    });
  });

  describe("a hand picking a robot up", () => {
    it("stops it dead while it is held, and lets it go again", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 500, y: 1000, h: 0, r: 62 });
      m.drive(1, 300, 300, 110);
      run(m, 200);
      m.hold(1, true);
      const x = m.bodyOf(1).x;
      run(m, 500);
      expect(m.bodyOf(1).x).toBe(x);               // the hand owns it
      expect(m.bodyOf(1).held).toBe(true);
      m.hold(1, false);
      run(m, 500);
      expect(m.bodyOf(1).x).toBeGreaterThan(x);
    });

    it("puts it exactly where the hand let go, with no leftover speed", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 500, y: 1000, h: 0, r: 62 });
      m.drive(1, 400, 400, 110);
      run(m, 300);
      m.place(1, 1234, 567, 1.2);
      const b = m.bodyOf(1);
      expect(b.x).toBe(1234);
      expect(b.y).toBe(567);
      expect(b.h).toBeCloseTo(1.2, 9);
      expect(b.speed).toBe(0);
    });
  });

  describe("the sonar ray", () => {
    it("measures to a wall exactly, not to the nearest four millimetres", () => {
      const m = build({ size: 2000 });
      expect(m.raycast({ x: 1000, y: 1500 }, 0)).toBeCloseTo(1000, 6);
      expect(m.raycast({ x: 1000, y: 1500 }, UP)).toBeCloseTo(1500, 6);
    });

    it("measures to the near edge of a piece of furniture", () => {
      /* a box is 300 x 150, so at (900, 500) its near edge is y = 650 */
      const m = build({ size: 2000, furniture: [{ name: "box", x: 900, y: 500 }] });
      expect(m.raycast({ x: 1000, y: 1500 }, UP)).toBeCloseTo(850, 6);
    });

    it("measures to another robot, and never to itself", () => {
      const m = build({ size: 2000 });
      m.add({ id: 1, x: 1000, y: 1500, h: UP, r: 62 });
      m.add({ id: 2, x: 1000, y: 1200, r: 62 });
      expect(m.raycast({ x: 1000, y: 1500 }, UP, { self: 1 })).toBeCloseTo(238, 6);
      expect(m.raycast({ x: 1000, y: 1500 }, UP)).toBe(0);     // its own body, at zero
    });

    it("loses the echo off a really glancing wall", () => {
      const m = build({ size: 2000 });
      expect(m.raycast({ x: 1000, y: 40 }, -0.1)).toBe(Infinity);
      expect(m.raycast({ x: 1000, y: 40 }, UP)).toBeCloseTo(40, 6);
    });

    it("sees nothing out there when the scene has no walls", () => {
      const m = build({ size: 2000, walls: false });
      expect(m.raycast({ x: 1000, y: 1000 }, UP)).toBe(Infinity);
    });

    it("stops at the reach it was given", () => {
      const m = build({ size: 4000 });
      expect(m.raycast({ x: 2000, y: 3000 }, UP, { reach: 500 })).toBe(Infinity);
    });
  });

  it("offers robots as shadow casters beside the furniture", () => {
    const m = build({ size: 2000, furniture: [{ name: "box", x: 100, y: 100 }] });
    expect(m.occluders()).toHaveLength(1);
    m.add({ id: 4, x: 500, y: 500, r: 62, z: 95 });
    const occ = m.occluders();
    expect(occ).toHaveLength(2);
    expect(occ[1].owner).toBe(4);
    expect(occ[1].box.w).toBe(124);
  });

  it("forgets a robot that is taken out of the room", () => {
    const m = build({ size: 2000 });
    m.add({ id: 1, x: 500, y: 500, r: 62 });
    expect(m.bodies()).toHaveLength(1);
    expect(m.remove(1)).toBe(true);
    expect(m.bodies()).toHaveLength(0);
    expect(m.raycast({ x: 500, y: 1500 }, UP)).toBeCloseTo(1500, 6);   // straight through to the wall
  });
});
