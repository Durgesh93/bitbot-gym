import { describe, it, expect } from "vitest";
import { createEnvironment } from "../../src/world/environment.js";
import { sample, placeOf } from "../../src/world/senses.js";
import { PROBES, CHASSIS, ldr, sonarCm, read } from "../../src/hardware/bitbot.js";

/* A bare room with one ceiling lamp, so a probe's answer is about the probe
   and not about the furniture. */
function room(extra) {
  return createEnvironment({
    name: "Test", size: 2000, walls: true,
    lamps: [{ x: 1000, y: 400, kind: "ceiling", on: true }],
    ...(extra || {})
  });
}
const bot = (x, y, h) => ({ id: 1, x: x, y: y, h: h == null ? 0 : h, r: CHASSIS.radius, z: 95 });

describe("probes", () => {
  it("puts each one where the robot's body says it is", () => {
    /* facing east, so forward is +x and the left sensor is at -y */
    const b = bot(1000, 1000, 0);
    const L = placeOf(b, PROBES[0]), R = placeOf(b, PROBES[1]);
    expect(L.x).toBeCloseTo(1055, 6);
    expect(L.y).toBeCloseTo(1000 - 34, 6);
    expect(R.y).toBeCloseTo(1000 + 34, 6);
  });

  it("carries them round when the robot turns", () => {
    const b = bot(1000, 1000, Math.PI / 2);         // now facing south
    const L = placeOf(b, PROBES[0]);
    expect(L.x).toBeCloseTo(1000 + 34, 6);          // left is now east
    expect(L.y).toBeCloseTo(1055, 6);
  });

  it("gives one answer per probe, in physical units", () => {
    const got = sample(room(), bot(1000, 1000), PROBES);
    expect(Object.keys(got).sort())
      .toEqual(["lightL", "lightR", "lineL", "lineR", "mic", "sonar"]);
    expect(got.lightL).toBeGreaterThan(0);          // gym units of light
    expect(got.sonar).toBeGreaterThan(100);         // millimetres to the wall
    expect(got.lineL.dark).toBe(false);             // a surface, not a number
  });

  it("does not let a robot shade its own eyes or blind its own sonar", () => {
    /* both probes sit inside the 62 mm body, so without `self` the robot's
       own chassis is the nearest thing to everything it owns */
    const got = sample(room(), bot(1000, 1000), PROBES);
    expect(got.sonar).toBeGreaterThan(CHASSIS.radius);
    expect(got.lightL).toBeGreaterThan(1);
  });

  it("turns the two eyes apart, so facing a lamp is not the same as beside it", () => {
    const env = room();
    /* the lamp is due north; turn the robot east and its LEFT eye, which
       points north-east, must get more of it than its right */
    const got = sample(env, bot(1000, 1000, 0), PROBES);
    expect(got.lightL).toBeGreaterThan(got.lightR);
    const other = sample(env, bot(1000, 1000, Math.PI), PROBES);
    expect(other.lightR).toBeGreaterThan(other.lightL);
  });

  it("reads the tape through the floor probes and not the light ones", () => {
    const env = room({ lines: [{ from: [0, 1000], to: [2000, 1000], width: 60 }] });
    /* the two line sensors sit 18 mm either side of the middle, so a 60 mm
       stripe under the robot covers both of them */
    const got = sample(env, bot(1000, 1000), PROBES);
    expect(got.lineL.dark).toBe(true);
    expect(got.lineR.dark).toBe(true);
  });

  it("refuses a probe kind nobody taught it", () => {
    expect(() => sample(room(), bot(1000, 1000), [{ name: "x", kind: "smell" }]))
      .toThrow(/no such probe/);
  });
});

describe("what the Bit:Bot makes of it", () => {
  it("squashes light the way an LDR does, not in a straight line", () => {
    /* twice the light is nowhere near twice the number - which is the whole
       reason a light-chasing program has to compare two eyes rather than
       wait for a threshold */
    expect(ldr(3)).toBe(568);
    expect(ldr(6) / ldr(3)).toBeLessThan(1.4);
    expect(ldr(0)).toBe(0);
    expect(ldr(10000)).toBe(1023);
  });

  it("says 0 for nothing in range, like the real sonar", () => {
    /* the one that catches children out every year: "nothing there" and
       "touching my nose" are both small numbers */
    expect(sonarCm(Infinity)).toBe(0);
    expect(sonarCm(2400)).toBe(0);
    expect(sonarCm(1430)).toBe(143);
    expect(sonarCm(84)).toBe(8);
  });

  it("gives the two eyes a squint, so they can never deadlock", () => {
    const flat = { lightL: 3, lightR: 3, lineL: { dark: false }, lineR: { dark: false },
                   sonar: Infinity, mic: 0 };
    expect(read(flat, 0).lightL).toBe(read(flat, 0).lightR);
    const r = read(flat, 5);
    expect(r.lightL).toBeGreaterThan(r.lightR);
  });

  it("hands the blocks whole numbers in the ranges the hardware uses", () => {
    const got = read(sample(room(), bot(1000, 1000), PROBES), 3);
    for (const k of ["lightL", "lightR", "sonar", "sound"]) {
      expect(Number.isInteger(got[k])).toBe(true);
    }
    expect(got.lightL).toBeLessThanOrEqual(1023);
    expect(got.lineL === 0 || got.lineL === 1).toBe(true);
    expect(got.sound).toBeLessThanOrEqual(255);
  });
});
