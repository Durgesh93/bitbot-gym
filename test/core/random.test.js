import { describe, it, expect } from "vitest";
import { createRandom, random } from "../../src/core/random.js";

describe("randomness you can repeat", () => {
  it("gives the same run twice from the same seed", () => {
    const a = createRandom(42), b = createRandom(42);
    const one = Array.from({ length: 50 }, () => a.next());
    const two = Array.from({ length: 50 }, () => b.next());
    expect(two).toEqual(one);
  });

  it("gives a different run from a different seed", () => {
    const a = createRandom(1), b = createRandom(2);
    expect(b.next()).not.toBe(a.next());
  });

  it("goes back to the start when it is reseeded, which is what Reset needs", () => {
    const r = createRandom(7);
    const first = [r.next(), r.next(), r.next()];
    r.reseed(7);
    expect([r.next(), r.next(), r.next()]).toEqual(first);
  });

  it("stays between 0 and 1", () => {
    const r = createRandom(3);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("spreads out evenly enough for sensor noise", () => {
    const r = createRandom(99);
    const bins = new Array(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) bins[Math.floor(r.next() * 10)]++;
    for (const b of bins) expect(Math.abs(b - n / 10) / (n / 10)).toBeLessThan(0.05);
  });

  it("jitters a sensor either way about zero", () => {
    const r = createRandom(5);
    let lo = 0, hi = 0;
    for (let i = 0; i < 2000; i++) { const v = r.plusMinus(3); if (v < 0) lo++; else hi++; expect(Math.abs(v)).toBeLessThanOrEqual(3); }
    expect(lo).toBeGreaterThan(800);
    expect(hi).toBeGreaterThan(800);
  });

  it("picks whole numbers inside the range, both ends included", () => {
    const r = createRandom(11);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(r.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("has one shared stream for the whole gym", () => {
    random.reseed(123);
    const a = random.next();
    random.reseed(123);
    expect(random.next()).toBe(a);
  });
});
