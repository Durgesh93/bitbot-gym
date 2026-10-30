import { describe, it, expect } from "vitest";
import { rotate, boxLocal, boxWorld, boxCentre, boxContains, boxCorners,
         boxNearest, hull, pointInPoly, dist } from "../../src/core/geom.js";

const box = { x: 400, y: 600, w: 200, h: 100, rot: 0 };

describe("geometry", () => {
  it("turns a point clockwise, because y points down a canvas", () => {
    const p = rotate({ x: 10, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(10, 9);
  });

  it("puts a box's centre in the middle of it", () => {
    expect(boxCentre(box)).toEqual({ x: 500, y: 650 });
  });

  it("goes into a box's own frame and back out again unchanged", () => {
    const turned = { ...box, rot: 0.7 };
    for (const p of [{ x: 0, y: 0 }, { x: 512, y: 931 }, { x: -40, y: 1200 }]) {
      const back = boxWorld(turned, boxLocal(turned, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it("knows what is inside a box, turned or not", () => {
    expect(boxContains(box, { x: 500, y: 650 })).toBe(true);
    expect(boxContains(box, { x: 500, y: 540 })).toBe(false);
    const turned = { ...box, rot: Math.PI / 2 };       // now 100 wide and 200 tall
    expect(boxContains(turned, { x: 500, y: 740 })).toBe(true);
    expect(boxContains(turned, { x: 590, y: 650 })).toBe(false);
  });

  it("gives four corners, and they sit the right distance from the centre", () => {
    const c = boxCorners(box), o = boxCentre(box);
    expect(c).toHaveLength(4);
    for (const p of c) expect(dist(p, o)).toBeCloseTo(Math.hypot(100, 50), 6);
  });

  it("finds the nearest edge of a box and how far outside you are", () => {
    const n = boxNearest(box, { x: 500, y: 800 });     // 150 below the middle, box is 50 tall each way
    expect(n.gap).toBeCloseTo(100, 6);
    expect(n.point.y).toBeCloseTo(700, 6);
    expect(boxNearest(box, { x: 500, y: 650 }).gap).toBe(0);
  });

  it("wraps a cloud of points in its outline", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
    const h = hull(pts);
    expect(h).toHaveLength(4);                         // the middle point is not on the outline
    expect(h.some(p => p.x === 5 && p.y === 5)).toBe(false);
  });

  it("gives back the points when there are too few to wrap", () => {
    expect(hull([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toHaveLength(2);
  });

  it("knows what is inside an outline", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPoly(5, 5, sq)).toBe(true);
    expect(pointInPoly(15, 5, sq)).toBe(false);
    expect(pointInPoly(5, -1, sq)).toBe(false);
  });
});
