import { describe, it, expect } from "vitest";
import { loadScene } from "../../../src/world/scene.js";
import { createGeometry } from "../../../src/world/fields/geometry.js";
import { createLight, normalFrom, UP } from "../../../src/world/fields/light.js";

const EYE_TILT = 0.80, EYE_Z = 42;
const eye = facing => ({ z: EYE_Z, normal: normalFrom(facing, EYE_TILT), bounce: false });

function build(data) {
  const scene = loadScene(data);
  const geometry = createGeometry(scene);
  return { scene, geometry, light: createLight(scene, geometry) };
}

describe("the light field", () => {
  it("gives exactly what the published gym gives, to the last digit", () => {
    /* These numbers came out of the single-file gym that is live today. If a
       change moves them, every light lesson's sensor readings have moved too,
       and that has to be a decision rather than an accident. */
    const { light } = build({ lamps: [{ x: 1500, y: 600, kind: "floor" }] });
    expect(light.at({ x: 1000, y: 1000 }, eye(0))).toBeCloseTo(2.64713641, 7);
    expect(light.at({ x: 1000, y: 1000 }, eye(-1.2))).toBeCloseTo(2.83727753, 7);
    expect(light.at({ x: 400, y: 1600 }, eye(0.7))).toBeCloseTo(0.17668219, 7);
    expect(light.at({ x: 200, y: 200 }, eye(-2.5))).toBeCloseTo(0.004, 7);
  });

  it("falls off with the square of the distance, softened close to the bulb", () => {
    /* The law is I/(d^2 + 0.09) with d in metres, not I/d^2: without that
       0.09 the reading blows up to infinity at the bulb itself. So the drop
       is a little gentler than a textbook inverse square up close, and
       indistinguishable from it across a room. */
    const { light } = build({ size: 4000, lamps: [{ x: 2000, y: 2000, kind: "floor", z: 0 }] });
    const o = { z: 0, normal: null, bounce: false };                    // from every direction
    const amb = light.ambient();
    const at = mm => light.at({ x: 2000, y: 2000 - mm }, o) - amb;
    const law = (a, b) => ((b / 1000) ** 2 + 0.09) / ((a / 1000) ** 2 + 0.09);

    expect(at(500) / at(1000)).toBeCloseTo(law(500, 1000), 6);
    expect(at(1000) / at(2000)).toBeCloseTo(law(1000, 2000), 6);
    expect(at(1000) / at(2000)).toBeGreaterThan(3.7);   // nearly the full 4x by a metre out
  });

  it("is dark with the lamp off and bright with it on, once the field is told", () => {
    const { scene, light } = build({ lamps: [{ x: 1000, y: 1000, kind: "ceiling", on: false }] });
    const spot = { x: 1000, y: 1400 };
    const dark = light.at(spot, eye(0));

    scene.lamps[0].on = true;        // what the world does when a child flicks the switch
    light.stale();
    const lit = light.at(spot, eye(0));

    expect(dark).toBeLessThan(0.1);
    expect(lit).toBeGreaterThan(2);
  });

  it("keeps serving the old answer until it is told the switch moved", () => {
    /* Not a nicety: the field is rebuilt once per tick, so it MUST ignore a
       change until the tick says so, or two sensors read in the same tick
       could disagree about whether the light is on. */
    const { scene, light } = build({ lamps: [{ x: 1000, y: 1000, kind: "ceiling", on: false }] });
    const before = light.at({ x: 1000, y: 1400 }, eye(0));
    scene.lamps[0].on = true;
    expect(light.at({ x: 1000, y: 1400 }, eye(0))).toBe(before);
    light.stale();
    expect(light.at({ x: 1000, y: 1400 }, eye(0))).toBeGreaterThan(before);
  });

  it("puts a tall thing's shadow on the floor behind it", () => {
    const { light } = build({
      lamps: [{ x: 1000, y: 400, kind: "floor" }],
      furniture: [{ name: "backpack", x: 920, y: 700 }]
    });
    const behind = light.at({ x: 1000, y: 1000 }, eye(-Math.PI / 2));
    const beside = light.at({ x: 1600, y: 1000 }, eye(-Math.PI / 2));
    expect(behind).toBeLessThan(beside);
  });

  it("lets one robot cast a shadow on another, which is the whole point", () => {
    const { geometry, light } = build({ lamps: [{ x: 1000, y: 300, kind: "floor" }] });
    /* A 95 mm robot lit by a lamp 300 mm up throws a shadow only about
       240 mm long, so the spot behind it has to be close. */
    const spot = { x: 1000, y: 780 };
    const clear = light.at(spot, eye(-Math.PI / 2));

    geometry.setBodies([{ owner: "A", x: 1000, y: 600, r: 62, z: 95 }]);
    light.stale();
    const blocked = light.at(spot, eye(-Math.PI / 2));

    expect(blocked).toBeLessThan(clear);
  });

  it("never puts a robot in its own shadow", () => {
    const { geometry, light } = build({ lamps: [{ x: 1000, y: 300, kind: "floor" }] });
    geometry.setBodies([{ owner: "A", x: 1000, y: 700, r: 62, z: 95 }]);
    light.stale();
    const own = light.at({ x: 1000, y: 700 }, { ...eye(-Math.PI / 2), self: "A" });
    const other = light.at({ x: 1000, y: 700 }, { ...eye(-Math.PI / 2), self: "B" });
    expect(own).toBeGreaterThan(other);
  });

  it("gives the sun no falloff at all, because it is 150 million km away", () => {
    const { light } = build({ walls: false, sun: { azimuth: 180, elevation: 40, I: 300, sky: 0 } });
    const o = { z: 0, normal: UP, bounce: false };
    const a = light.at({ x: 100, y: 100 }, o);
    const b = light.at({ x: 1900, y: 1900 }, o);
    expect(a).toBeCloseTo(b, 9);
  });

  it("lays every outdoor shadow the same way, because the rays are parallel", () => {
    const { light } = build({
      walls: false, sun: { azimuth: 0, elevation: 30, I: 300, sky: 0 },
      furniture: [{ name: "cone", x: 500, y: 900 }, { name: "cone", x: 1400, y: 900 }]
    });
    const o = { z: 0, normal: UP, bounce: false };
    /* azimuth 0 means the sun is up the screen, so both shadows fall DOWN it */
    const open = light.at({ x: 950, y: 1200 }, o);
    expect(light.at({ x: 590, y: 1200 }, o)).toBeLessThan(open);
    expect(light.at({ x: 1490, y: 1200 }, o)).toBeLessThan(open);
  });

  it("makes the shadow longer as the sun gets lower", () => {
    const far = (elevation) => {
      const { light } = build({
        size: 4000, walls: false,
        sun: { azimuth: 0, elevation, I: 300, sky: 0 },
        furniture: [{ name: "cone", x: 910, y: 900, z: 300 }]
      });
      const o = { z: 0, normal: UP, bounce: false };
      let d = 0;
      for (let y = 1100; y < 3500; y += 20) if (light.at({ x: 1000, y }, o) < 100) d = y - 1080;
      return d;
    };
    expect(far(20)).toBeGreaterThan(far(60));
  });

  it("floods an outdoor scene with far more light than a classroom ever has", () => {
    /* A lit classroom is about 3 gym units. This is the honest reason a
       light-seeking program stops working outdoors, and it belongs in the
       physics rather than being fudged away. */
    const indoor = build({ lamps: [{ x: 1000, y: 1000, kind: "ceiling" }] });
    const sunny = build({ walls: false, sun: { azimuth: 140, elevation: 35, I: 600 } });
    expect(indoor.light.at({ x: 1000, y: 1400 }, eye(0))).toBeLessThan(6);
    expect(sunny.light.at({ x: 1000, y: 1400 }, eye(0))).toBeGreaterThan(100);
  });
});
