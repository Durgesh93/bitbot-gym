/* The magnetic field: which way is north, here, right now.

   Until this existed the compass was worked out from the robot's heading
   and nothing else, which quietly said something false - that the field
   is the same everywhere and a compass can only be wrong by turning. Any
   child who has put a magnet next to one knows better, and it is the
   first science lesson a compass is good for.

   TWO THINGS ADD UP HERE, and they are on wildly different scales.

     THE EARTH, about 50 microtesla over southern Norway, the same in
     every corner of the room. Most of it points DOWN - 72 degrees below
     horizontal - and only the small horizontal part, around 15 uT, is any
     use for finding north. That is the honest reason a compass is so
     easily upset: the part doing the work is the small part.

     THE MAGNETS somebody has put on the floor. A magnet is a DIPOLE, and
     a dipole falls off as one over the distance CUBED - much faster than
     light or sound, which go as the square. That one exponent is the
     whole character of the thing: a magnet that swamps the Earth at a
     hand's width is doing almost nothing a ruler away. Double the
     distance and you have an EIGHTH of the field.

   There is no shadowing in here and no bouncing. Magnetism goes through
   a table as though it were not there, which is why this field is short
   and the sound field is long. */

/* Over southern Norway. `declination` is how far magnetic north sits from
   the top of the screen, `inclination` how steeply the whole thing dives
   into the ground. */
export const EARTH = { total: 50.5, inclination: 72, declination: 3 };

/* 1e-7 is mu-nought over four pi. Moments are in ampere metres squared and
   distances in metres, which gives tesla - and a million of those to the
   microtesla the board reports. */
const DIPOLE = 1e-7 * 1e6;

/* Magnetic north as a direction on the canvas. North is up the screen,
   which is -y, swung round by the declination. */
export function northOf(field) {
  const d = (field || EARTH).declination;
  const a = -Math.PI / 2 + d * Math.PI / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

export function earthField(spec) {
  const f = spec || EARTH;
  const incl = f.inclination * Math.PI / 180;
  const H = f.total * Math.cos(incl);            // the horizontal part, about 15 uT
  const n = northOf(f);
  /* z is measured UPWARDS here, and the Earth's field points down, so it
     is negative. The board flips it back when it reports its own z axis. */
  return { x: H * n.x, y: H * n.y, z: -f.total * Math.sin(incl) };
}

export function createMagnetic(scene) {
  const live = () => (scene.magnets || []).filter(m => m.on !== false);

  /* One bar magnet, lying flat, its north pole pointing along `rot`.

     B = (3(m.r)r - m) / r^3, the textbook dipole, in microtesla. Right on
     the axis that comes to twice what it is out to the side, which is why
     a compass swings hardest when you come at it end-on. */
  function fromOne(mag, p, pz) {
    const dx = (p.x - mag.x) / 1000, dy = (p.y - mag.y) / 1000;
    const dz = (pz - (mag.z == null ? 20 : mag.z)) / 1000;
    const r2 = dx * dx + dy * dy + dz * dz;
    /* Inside the magnet itself the dipole sum runs away to infinity, and a
       real magnetometer would simply be saturated. Hold it at the value
       on the casing rather than letting it divide by nearly nothing. */
    const least = 0.018;                          // 18mm, about half a magnet
    const r = Math.max(Math.sqrt(r2), least);
    const strength = mag.moment == null ? 2.5 : mag.moment;
    const a = (mag.rot || 0);
    const mx = Math.cos(a) * strength, my = Math.sin(a) * strength, mz = 0;
    const ux = dx / r, uy = dy / r, uz = dz / r;
    const dot = mx * ux + my * uy + mz * uz;
    const k = DIPOLE / (r * r * r);
    return { x: k * (3 * dot * ux - mx),
             y: k * (3 * dot * uy - my),
             z: k * (3 * dot * uz - mz) };
  }

  return {
    /* The whole field at a point, in microtesla, z upwards. */
    at(p, opts) {
      const pz = (opts && opts.z != null) ? opts.z : 42;
      const e = earthField(scene.earth);
      let x = e.x, y = e.y, z = e.z;
      for (const m of live()) {
        const b = fromOne(m, p, pz);
        x += b.x; y += b.y; z += b.z;
      }
      return { x, y, z };
    },
    magnets: live,
    earth: () => earthField(scene.earth)
  };
}
