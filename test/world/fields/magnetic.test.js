import { describe, it, expect } from "vitest";
import { createMagnetic, EARTH, earthField } from "../../../src/world/fields/magnetic.js";
import { compassHeading, magneticForce } from "../../../src/hardware/microbit.js";

const build = magnets => createMagnetic({ magnets: magnets || [] });
const size = B => Math.hypot(B.x, B.y, B.z);

describe("the magnetic field", () => {
  it("is the Earth's alone in a room with no magnets, and the same everywhere", () => {
    const f = build();
    const a = f.at({ x: 100, y: 100 }), b = f.at({ x: 1900, y: 1700 });
    expect(size(a)).toBeCloseTo(EARTH.total, 6);
    expect(a).toEqual(b);
    /* and most of it points DOWN, which is the honest reason a compass is
       so easily upset: the part doing the work is only about 15 of the 50 */
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(15.6, 1);
  });

  it("falls off as one over the distance cubed", () => {
    /* The signature of a dipole, and the whole character of a magnet: two
       hand-widths away is an EIGHTH of the field, not a quarter. */
    const f = build([{ x: 1000, y: 1000, rot: 0, moment: 4 }]);
    const earth = earthField();
    const pts = [];
    for (let d = 120; d <= 480; d += 40) {
      const B = f.at({ x: 1000 + d, y: 1000 });
      const own = size({ x: B.x - earth.x, y: B.y - earth.y, z: B.z - earth.z });
      pts.push([Math.log(d), Math.log(own)]);
    }
    const n = pts.length;
    const sx = pts.reduce((a, q) => a + q[0], 0), sy = pts.reduce((a, q) => a + q[1], 0);
    const sxy = pts.reduce((a, q) => a + q[0] * q[1], 0);
    const sxx = pts.reduce((a, q) => a + q[0] * q[0], 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    expect(slope).toBeGreaterThan(-3.05);
    expect(slope).toBeLessThan(-2.95);
  });

  it("is twice as strong off the end as it is off the side", () => {
    /* Textbook dipole, and the reason a compass swings hardest when the
       magnet comes at it end-on. */
    const f = build([{ x: 1000, y: 1000, rot: 0, moment: 4 }]);
    const e = earthField();
    const own = p => { const B = f.at(p);
                       return size({ x: B.x - e.x, y: B.y - e.y, z: B.z - e.z }); };
    const end = own({ x: 1400, y: 1000 });        // along its axis
    const side = own({ x: 1000, y: 1400 });       // out to one side
    expect(end / side).toBeCloseTo(2, 1);
  });

  it("adds two magnets together", () => {
    const one = build([{ x: 900, y: 1000, rot: 0, moment: 4 }]);
    const two = build([{ x: 900, y: 1000, rot: 0, moment: 4 },
                       { x: 1100, y: 1000, rot: 0, moment: 4 }]);
    const p = { x: 1000, y: 1000 };
    const e = earthField();
    const a = two.at(p), b = one.at(p);
    /* the second one's whole contribution is the difference, and it is
       not nothing - it is standing 100mm away */
    expect(size({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })).toBeGreaterThan(50);
    expect(size(a)).not.toBeCloseTo(size(b), 1);
    expect(size(b)).toBeGreaterThan(size(e));
  });

  it("turns round when the magnet does", () => {
    const p = { x: 1300, y: 1000 };
    const e = earthField();
    const own = f => { const B = f.at(p);
                       return { x: B.x - e.x, y: B.y - e.y, z: B.z - e.z }; };
    const north = own(build([{ x: 1000, y: 1000, rot: 0, moment: 4 }]));
    const about = own(build([{ x: 1000, y: 1000, rot: Math.PI, moment: 4 }]));
    expect(about.x).toBeCloseTo(-north.x, 6);
    expect(about.y).toBeCloseTo(-north.y, 6);
  });

  it("switches off without being taken away", () => {
    const off = build([{ x: 1000, y: 1000, rot: 0, moment: 4, on: false }]);
    expect(size(off.at({ x: 1200, y: 1000 }))).toBeCloseTo(EARTH.total, 6);
  });

  it("does not run away to infinity underneath the board", () => {
    /* A dipole sum divides by the distance cubed, and right on top of the
       magnet that is nearly nothing. A real magnetometer just saturates. */
    const f = build([{ x: 1000, y: 1000, rot: 0, moment: 4 }]);
    for (const p of [{ x: 1000, y: 1000 }, { x: 1001, y: 1000 }, { x: 1000, y: 1002 }]) {
      const v = size(f.at(p));
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeLessThan(200000);
    }
  });

  it("sends the compass round when a magnet comes near, and not when it is far", () => {
    /* The lesson this is all for: a compass points at the field it is in,
       not at the pole. */
    /* ACROSS the Earth's field, not along it. The Earth's horizontal part
       points up the screen, so a magnet whose field at the board ALSO
       points up the screen makes the reading stronger and leaves the
       direction alone - the compass barely twitches. To send it round,
       the magnet's field has to pull sideways. */
    const f = build([{ x: 1000, y: 1000, rot: 0, moment: 4 }]);
    const facing = 0;
    const far = f.at({ x: 1900, y: 100 });
    const near = f.at({ x: 1120, y: 1000 });
    /* NOT exactly equal: a dipole's reach never quite reaches zero, and
       even across the room this one is still worth about a degree. That
       is the right answer, and pretending otherwise would be the wrong
       one - so the test says "near enough to not notice". */
    expect(Math.abs(compassHeading(facing, far) - compassHeading(facing)))
      .toBeLessThanOrEqual(2);
    expect(Math.abs(compassHeading(facing, near) - compassHeading(facing)))
      .toBeGreaterThan(30);
    /* and the strength the card shows has climbed well past the Earth */
    expect(magneticForce(facing, undefined, near)).toBeGreaterThan(EARTH.total * 2);
    /* across the room it is worth under a tenth of a microtesla - there,
       but not something a child would ever see move */
    expect(magneticForce(facing, undefined, far)).toBeLessThan(EARTH.total * 1.01);
    expect(magneticForce(facing, undefined, far)).toBeGreaterThan(EARTH.total * 0.99);
  });
});
