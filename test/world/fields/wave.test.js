import { describe, it, expect } from "vitest";
import { carve, ring, yardstick, admittanceFor } from "../../../src/world/fields/wave.js";

/* THE WAVE SOLVER IS CHECKED AGAINST THINGS THAT WERE KNOWN BEFORE IT
   EXISTED. Every other test in here asks whether the gym behaves the way
   the gym is supposed to, which cannot catch a field that is wrong in the
   same way everywhere. These four ask whether the air behaves like air:
   the inverse square law, Eyring's reverberation time, conservation of
   energy, and the textbook conversion between a material's absorption and
   its impedance. All four were got wrong at least once while this was
   being written, and all four showed it. */

const C = 343000;
const box = (size, height, ga, wa, ca, furniture) => ({
  size, sun: null, ground: { absorb: ga },
  sky: { wallsAbsorb: wa, ceilingAbsorb: ca }, furniture: furniture || []
});

describe("the wave solver", () => {
  it("falls off as one over the distance squared, out in the open",
     { timeout: 20000 }, () => {
    /* Every surface swallows almost everything, so only the straight
       wave is left and it must thin out exactly the way a sphere does.
       This came out at r^-1.94 while the walls still used a cheap
       reflection, and that 3% was the boundary leaking. */
    const cell = 40, side = cell * 36;
    const room = carve(box(side, side, 0.99, 0.99, 0.99), cell, side);
    const mid = Math.floor(room.ix / 2), midZ = Math.floor(room.iz / 2);
    const out = ring(room, { x: (mid + 0.5) * room.cell, y: (mid + 0.5) * room.cell,
                             z: (midZ + 0.5) * room.cell }, { plane: midZ });
    const pts = [];
    for (let d = 5; d <= 13; d++) {
      const e = out.heard[mid * room.ix + mid + d];
      if (e > 0) pts.push([Math.log(d * room.cell), Math.log(e)]);
    }
    const n = pts.length;
    const sx = pts.reduce((a, q) => a + q[0], 0), sy = pts.reduce((a, q) => a + q[1], 0);
    const sxy = pts.reduce((a, q) => a + q[0] * q[1], 0);
    const sxx = pts.reduce((a, q) => a + q[0] * q[0], 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    expect(slope).toBeGreaterThan(-2.15);
    expect(slope).toBeLessThan(-1.85);
  });

  it("dies away at the rate Eyring says it should", { timeout: 20000 }, () => {
    /* Sabine is the formula everyone quotes, but it assumes a room only
       swallows a little on each bounce and these swallow half, so Eyring
       is the one to be judged against - Sabine reads 12 to 29% long here
       and the error grows with absorption, which is exactly its known
       failing. Measured as T20: fit the slope between 5 and 25 dB below
       the peak. Fitting further down than that measures the floating
       point noise floor and reports forty-three seconds. */
    for (const [ga, wa, ca] of [[0.03, 0.15, 0.60], [0.03, 0.55, 0.60], [0.30, 0.30, 0.30]]) {
      /* a coarser grid than the gym uses: this is measuring how fast the
         room dies, which the cell size barely touches, and three rooms
         run to silence is slow enough already */
      const size = 2000, height = 2500, cell = 70;
      const room = carve(box(size, height, ga, wa, ca), cell, height);
      const out = ring(room, { x: 600, y: 600, z: 800 },
                       { plane: 2, watch: true, steps: 12000 });
      const dB = i => 10 * Math.log10(out.watch[i] + 1e-300);
      let peak = 0, pi = 0;
      out.watch.forEach((v, i) => { if (v > peak) { peak = v; pi = i; } });
      const after = (down) => {
        for (let i = pi; i < out.watch.length; i++) if (dB(i) <= dB(pi) - down) return i;
        return -1;
      };
      const a = after(5), b = after(25);
      expect(a).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(a);
      const rt = -60 / ((dB(b) - dB(a)) / ((b - a) * out.dt));

      const V = (size / 1000) ** 2 * (height / 1000);
      const S = 2 * (size / 1000) ** 2 + 4 * (size / 1000) * (height / 1000);
      const A = (size / 1000) ** 2 * (ga + ca) + 4 * (size / 1000) * (height / 1000) * wa;
      const eyring = 0.161 * V / (-S * Math.log(1 - A / S));
      expect(rt).toBeGreaterThan(eyring * 0.8);
      expect(rt).toBeLessThan(eyring * 1.2);
    }
  });

  it("does not lose or gain energy in a room with nothing to swallow it",
     { timeout: 20000 }, () => {
    const cell = 60, side = cell * 24;
    const room = carve(box(side, side, 0, 0, 0), cell, side);
    const m = Math.floor(room.ix / 2), mz = Math.floor(room.iz / 2);
    const out = ring(room, { x: (m + 0.5) * room.cell, y: (m + 0.5) * room.cell,
                             z: (mz + 0.5) * room.cell },
                     { plane: mz, watch: true, steps: 1800 });
    const mean = (a, b) => out.watch.slice(a, b).reduce((p, q) => p + q, 0) / (b - a);
    const early = mean(600, 800), late = mean(1600, 1800);
    expect(late / early).toBeGreaterThan(0.9);
    expect(late / early).toBeLessThan(1.1);
  });

  it("reads a material's absorption the way the tables mean it", () => {
    /* Published absorption is measured with sound arriving from every
       direction at once. Converting it with the straight-on formula -
       (1-sqrt(1-a))/(1+sqrt(1-a)) - asks a wall to swallow about twice
       what the table says, and every room then died twice as fast as it
       should. For a soft-ish wall the right answer is near a/8. */
    expect(admittanceFor(0)).toBe(0);
    const soft = admittanceFor(0.2);
    expect(soft).toBeGreaterThan(0.2 / 8 * 0.8);
    expect(soft).toBeLessThan(0.2 / 8 * 1.3);
    const headOn = a => { const R = Math.sqrt(1 - a); return (1 - R) / (1 + R); };
    expect(soft).toBeLessThan(headOn(0.2) * 0.65);     // the factor that was wrong
    expect(admittanceFor(0.8)).toBeGreaterThan(admittanceFor(0.3));
  });

  it("cuts a grid that covers the room exactly", () => {
    /* 60mm cells do not divide a 2000mm room, and taking 33 of them
       models a room 20mm too small: everything then creeps as you cross
       the floor and a speaker in the middle is no longer in the middle. */
    for (const size of [2000, 1800, 2400, 3000]) {
      const room = carve(box(size, 2500, 0.1, 0.2, 0.3), 60, 2500);
      expect(room.ix * room.cell).toBeCloseTo(size, 6);
    }
  });

  it("quotes its answers against one metre in the open", { timeout: 20000 }, () => {
    const cell = 60;
    const scale = yardstick(cell);
    const side = cell * 40;
    const room = carve(box(side, side, 0.99, 0.99, 0.99), cell, side);
    const m = Math.floor(room.ix / 2), mz = Math.floor(room.iz / 2);
    const out = ring(room, { x: (m + 0.5) * room.cell, y: (m + 0.5) * room.cell,
                             z: (mz + 0.5) * room.cell }, { plane: mz });
    const d = 1000 / room.cell;
    const near = out.heard[m * room.ix + m + Math.round(d)] * scale;
    expect(near).toBeGreaterThan(0.8);
    expect(near).toBeLessThan(1.25);
  });
});
