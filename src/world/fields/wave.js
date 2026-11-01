/* THE ROOM, SOLVED AS A PRESSURE WAVE.

   Everywhere else in here a field is worked out by reasoning about paths:
   a straight line to the source, something in the way, a correction for
   the sound bending over the top of it. That works, and it is what this
   field used to do. But it is three separate laws stitched together - an
   inverse square, Maekawa's barrier formula, and a bounced-energy solve -
   and each of them is an approximation of the same single thing.

   The single thing is a wave. Air is springy and it has mass, so a push
   somewhere spreads out as a ripple, and EVERYTHING ELSE follows from
   that: the quietness far away, the soft shadow behind a cupboard, the
   ring of a bare room, the deadness of a carpeted one. None of it has to
   be put in by hand.

   WHY THIS IS AFFORDABLE FOR SOUND AND NOT FOR LIGHT. The only thing that
   makes a wave simulation expensive is needing cells much smaller than a
   wavelength. Light's wavelength is half a MICRON, so a room would need
   about a quadrillion cells and the whole idea is hopeless - which is why
   light is done with rays and patches next door. Sound at the pitch a
   micro:bit buzzes is a third of a METRE, so a six-centimetre cell is
   plenty, and the whole room is about forty thousand of them. That is a
   rounding error by comparison, and it is the entire reason this file can
   exist while its opposite number for light cannot.

   WHAT IT COSTS AND WHY IT IS CACHED. One solve walks the whole room
   forwards in time in steps of about a tenth of a millisecond, which is
   what it takes for the arithmetic to stay stable. That is a few hundred
   steps over forty thousand cells, so it is not something to do sixty
   times a second - but it does not have to be. One solve gives the answer
   at EVERY point at once, so the cost is per SOURCE, not per listener,
   and a speaker that has not moved does not need solving again. */

const C = 343000;                 // speed of sound, mm/s
const COURANT = 0.5;              // below 1/sqrt(3); the scheme blows up above it
const REF = 1000;                 // the distance the answers are quoted at: one metre
const QUIET = 1e-3;               // stop once the room is 30 dB down: the rest is 0.1%
const MOST_STEPS = 6000;          // a hard stop, for a room with nothing to swallow sound

/* --------------------------------------------------------------------
   Materials
   -------------------------------------------------------------------- */

/* A material's absorption coefficient - the number in published tables,
   and the number Sabine's and Eyring's formulas expect - is measured with
   sound arriving from every direction at once. A wall in here needs an
   ADMITTANCE instead, and the obvious conversion, the one for sound
   arriving head-on, is wrong by about a factor of two: it makes the wall
   swallow roughly twice what the table says and the room die twice as
   fast as it should. Measured against Eyring, that error showed up as a
   reverberation time 50% short in every room tried.

   So do what Paris did: average the absorption over every angle a wave
   could arrive from, and search for the impedance whose average lands on
   the figure we were given. */
export function admittanceFor(alpha) {
  const a = Math.max(0, Math.min(0.99, alpha));
  if (a <= 0) return 0;
  const overAllAngles = (Z) => {
    let s = 0;
    const n = 256;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;                   // u = cos(angle of arrival)
      const r = (Z * u - 1) / (Z * u + 1);       // what bounces back at that angle
      s += (1 - r * r) * 2 * u / n;              // ... weighted the way arrivals are
    }
    return s;
  };
  let lo = 1, hi = 1e7;                          // Z=1 swallows most, Z huge is rigid
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (overAllAngles(mid) > a) lo = mid; else hi = mid;
  }
  return 1 / Math.sqrt(lo * hi);
}

/* Is this cell inside this piece of furniture? Boxes may be turned, and a
   few of them are round, so ask the shape rather than the bounding box. */
function inside(f, x, y) {
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  let dx = x - cx, dy = y - cy;
  if (f.rot) {
    const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
    const rx = dx * c - dy * s; dy = dx * s + dy * c; dx = rx;
  }
  if (f.round) return (dx / (f.w / 2)) ** 2 + (dy / (f.h / 2)) ** 2 <= 1;
  return Math.abs(dx) <= f.w / 2 && Math.abs(dy) <= f.h / 2;
}

/* --------------------------------------------------------------------
   The room, cut into cells
   -------------------------------------------------------------------- */

export function carve(scene, want, height) {
  /* THE GRID HAS TO COVER THE ROOM EXACTLY. Asking for 60mm cells in a
     2000mm room gives 33 of them, which is 1980mm - and then the whole
     room is read through a grid a centimetre too small, every position
     creeps as you cross the floor, and the field is no longer symmetric
     about a speaker standing in the middle of it. So take the asked-for
     size as a wish, and use whatever divides the room evenly. */
  const ix = Math.max(4, Math.round(scene.size / want));
  const cell = scene.size / ix;
  const iz = Math.max(4, Math.round(height / cell));
  /* one ring of cells all the way round, so the hot loop never has to ask
     whether a neighbour exists - outside the room is simply solid */
  const nx = ix + 2, ny = ix + 2, nz = iz + 2, N = nx * ny * nz;
  const sy = nx, sz = nx * ny;
  const at = (i, j, k) => ((k + 1) * ny + (j + 1)) * nx + (i + 1);

  const solid = new Uint8Array(N).fill(1);
  const skin = new Float32Array(N);              // admittance of whatever is out there
  for (let k = 0; k < iz; k++)
    for (let j = 0; j < ix; j++)
      for (let i = 0; i < ix; i++) solid[at(i, j, k)] = 0;

  const bWall = admittanceFor(scene.sky.wallsAbsorb),
        bFloor = admittanceFor(scene.ground.absorb),
        bCeil = admittanceFor(scene.sky.ceilingAbsorb);
  for (let k = -1; k <= iz; k++)
    for (let j = -1; j <= ix; j++)
      for (let i = -1; i <= ix; i++) {
        const p = at(i, j, k);
        if (i < 0 || j < 0 || i >= ix || j >= ix) skin[p] = bWall;
        if (k < 0) skin[p] = bFloor;
        if (k >= iz) skin[p] = bCeil;
      }
  /* OUTDOORS THERE IS NO ROOM TO RING IN. A fence is not a ceiling and the
     sky is not a wall, so the sides and the lid simply swallow everything
     and all that answers back is the ground. It is why shouting across a
     playground is such hard work. */
  if (scene.sun) {
    const open = admittanceFor(0.99);
    for (let k = -1; k <= iz; k++)
      for (let j = -1; j <= ix; j++)
        for (let i = -1; i <= ix; i++) {
          const p = at(i, j, k);
          if (i < 0 || j < 0 || i >= ix || j >= ix || k >= iz) skin[p] = open;
        }
  }

  for (const f of scene.furniture) {
    const top = Math.min(iz, Math.round((f.z || 200) / cell));
    const b = admittanceFor(f.absorb == null ? 0.15 : f.absorb);
    for (let j = 0; j < ix; j++)
      for (let i = 0; i < ix; i++) {
        if (!inside(f, (i + 0.5) * cell, (j + 0.5) * cell)) continue;
        for (let k = 0; k < top; k++) { const p = at(i, j, k); solid[p] = 1; skin[p] = b; }
      }
  }

  /* Sort the air into cells with all six neighbours - the great majority,
     and the ones worth a loop with nothing in it - and cells against
     something, which need their reflections worked out. */
  const open = [], edge = [], reads = [];
  const loss = new Float32Array(N);
  for (let k = 0; k < iz; k++)
    for (let j = 0; j < ix; j++)
      for (let i = 0; i < ix; i++) {
        const p = at(i, j, k);
        if (solid[p]) continue;
        const six = [p - 1, p + 1, p - sy, p + sy, p - sz, p + sz];
        const opposite = [p + 1, p - 1, p + sy, p - sy, p + sz, p - sz];
        let shut = 0, b = 0;
        const mine = [];
        for (let d = 0; d < 6; d++) {
          if (solid[six[d]]) {
            shut++; b += skin[six[d]];
            /* A SURFACE REFLECTS: the air just beyond it carries whatever
               the air just inside carries, which is the cell on the other
               side of this one. Reading this cell's own value there
               instead is a cheaper boundary and a different wall - it
               leaks, and the free-field falloff comes out at r^-1.94
               instead of r^-2. */
            mine.push(solid[opposite[d]] ? p : opposite[d]);
          } else mine.push(six[d]);
        }
        loss[p] = b;
        if (shut) { edge.push(p); reads.push(mine); }
        else open.push(p);
      }
  const flat = new Int32Array(reads.length * 6);
  reads.forEach((r, n) => flat.set(r, n * 6));

  return { ix, iz, nx, ny, nz, N, sy, sz, cell, at, solid, loss,
           open: Int32Array.from(open), edge: Int32Array.from(edge), reads: flat };
}

/* --------------------------------------------------------------------
   Letting it ring
   -------------------------------------------------------------------- */

/* A SPEAKER IS A BOX, AND THE SOUND COMES OFF THE OUTSIDE OF IT. Its own
   cabinet is furniture like any other, so the point we were handed is
   usually buried inside something solid - and a click let off inside a
   sealed box is heard by nobody. A real cone sits in the surface, so walk
   outwards until there is air and speak from there. The same rescue
   covers a robot that has been dragged half under a table. */
function speakFrom(room, i, j, k) {
  const here = room.at(i, j, k);
  if (!room.solid[here]) return here;
  for (let out = 1; out <= 4; out++) {
    let best = -1, nearest = Infinity;
    for (let dk = -out; dk <= out; dk++)
      for (let dj = -out; dj <= out; dj++)
        for (let di = -out; di <= out; di++) {
          const a = i + di, b = j + dj, c = k + dk;
          if (a < 0 || b < 0 || c < 0 || a >= room.ix || b >= room.ix || c >= room.iz) continue;
          const p = room.at(a, b, c);
          if (room.solid[p]) continue;
          const d = di * di + dj * dj + dk * dk;
          if (d < nearest) { nearest = d; best = p; }
        }
    if (best >= 0) return best;
  }
  return -1;
}

/* Set off one sharp click at the source and add up how much sound energy
   passes every point before the room goes quiet.

   WHY A CLICK AND NOT A STEADY TONE. A steady tone standing in a room
   builds up a fixed pattern of loud and quiet stripes half a wavelength
   apart, so a robot creeping across the floor would read 200, then 40,
   then 200 again. That is perfectly true of a pure tone and nothing like
   what a classroom sounds like, because real sound is a spread of pitches
   and their stripes land in different places and average away. A click
   contains every pitch at once, so one solve gives that average directly
   - and the total energy it delivers to a point is exactly proportional
   to how loud a continuous source would sound there. */
export function ring(room, source, opts) {
  const o = opts || {};
  const dt = COURANT * room.cell / C;
  const l2 = COURANT * COURANT;
  const { open, edge, reads, loss, sy, sz } = room;
  const plane = Math.max(0, Math.min(room.iz - 1,
                 o.plane == null ? 0 : o.plane));

  const hold = new Float32Array(room.N), bounce = new Float32Array(room.N),
        push = new Float32Array(room.N);
  for (let z = 0; z < edge.length; z++) {
    const p = edge[z], d = COURANT * loss[p], inv = 1 / (1 + d);
    hold[p] = (2 - 6 * l2) * inv;
    bounce[p] = (1 - d) * inv;
    push[p] = l2 * inv;
  }
  const plain = 2 - 6 * l2;

  let was = new Float32Array(room.N), now = new Float32Array(room.N),
      next = new Float32Array(room.N);

  const face = new Int32Array(room.ix * room.ix);
  for (let j = 0; j < room.ix; j++)
    for (let i = 0; i < room.ix; i++) face[j * room.ix + i] = room.at(i, j, plane);
  const heard = new Float32Array(face.length);
  /* The whole room's energy at each step, when somebody is checking how
     fast the room dies away rather than how loud it is. */
  const watch = o.watch ? [] : null;

  const sp = speakFrom(room,
    Math.max(0, Math.min(room.ix - 1, Math.floor(source.x / room.cell))),
    Math.max(0, Math.min(room.ix - 1, Math.floor(source.y / room.cell))),
    Math.max(0, Math.min(room.iz - 1, Math.floor(source.z / room.cell))));
  if (sp < 0) return { heard, steps: 0, dt, plane };

  /* The click is shaped so it holds every pitch the grid can carry and
     none it cannot, and it sums to zero - a pulse with a lump of nothing
     in it would leave the whole room sitting at a pressure it never
     returns from. */
  const top = C / (10 * room.cell);
  const w = 0.48 / top, mid = 4 * w;
  const cap = o.steps || MOST_STEPS;

  let loudest = 0, steps = 0, smooth = 0;
  for (let n = 0; n < cap; n++) {
    for (let z = 0; z < open.length; z++) {
      const p = open[z];
      next[p] = plain * now[p] - was[p] +
                l2 * (now[p - 1] + now[p + 1] + now[p - sy] + now[p + sy] +
                      now[p - sz] + now[p + sz]);
    }
    for (let z = 0; z < edge.length; z++) {
      const p = edge[z], q = z * 6;
      next[p] = hold[p] * now[p] - bounce[p] * was[p] +
                push[p] * (now[reads[q]] + now[reads[q + 1]] + now[reads[q + 2]] +
                           now[reads[q + 3]] + now[reads[q + 4]] + now[reads[q + 5]]);
    }
    const t = n * dt - mid;
    next[sp] += -2 * (t / (w * w)) * Math.exp(-(t / w) * (t / w));

    let live = 0;
    for (let z = 0; z < face.length; z++) {
      const v = next[face[z]];
      const e = v * v;
      heard[z] += e;
      live += e;
    }
    if (watch) {
      let all = 0;
      for (let z = 0; z < open.length; z++) { const v = next[open[z]]; all += v * v; }
      for (let z = 0; z < edge.length; z++) { const v = next[edge[z]]; all += v * v; }
      watch.push(all);
    }
    steps = n + 1;
    /* Stop when the room has gone quiet rather than after a fixed time:
       a dead room is done in a fraction of what a live one needs, and
       one number guessed for both wastes the one and truncates the other.

       TWO THINGS MAKE THIS FIDDLIER THAN IT LOOKS. The energy at any
       instant swings wildly as the wave sloshes about, so a single dip
       is not the room going quiet - it is the wave being momentarily
       somewhere else, and stopping on it cuts the tail off. And the
       loudest instant of all is the click itself, which is not part of
       the decay at all; measuring the fall from there stops the run
       before the room has properly started ringing. So: smooth it, and
       do not start watching until the click is over. */
    smooth += (live - smooth) * 0.1;
    if (n * dt > mid * 2) {
      if (smooth > loudest) loudest = smooth;
      else if (loudest > 0 && smooth < loudest * QUIET) break;
    }

    const spare = was; was = now; now = next; next = spare;
  }

  /* THE FLOOR PLAN HAS HOLES IN IT where the furniture stands, because
     there is no air inside a cupboard and nothing was ever added up
     there. Nobody asks how loud it is inside a table - but a robot
     shoved up against one is sampled from the four cells around it, and
     if one of those is a hole the reading dives for no reason the child
     can see. So flood the holes with what is going on just outside them. */
  const holes = [];
  for (let j = 0; j < room.ix; j++)
    for (let i = 0; i < room.ix; i++)
      if (room.solid[face[j * room.ix + i]]) holes.push(j * room.ix + i);
  for (let pass = 0; pass < 4 && holes.length; pass++) {
    const fixed = [];
    for (const h of holes) {
      const i = h % room.ix, j = (h / room.ix) | 0;
      let sum = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= room.ix || b >= room.ix) continue;
        const v = heard[b * room.ix + a];
        if (v > 0) { sum += v; n++; }
      }
      if (n) heard[h] = sum / n; else fixed.push(h);
    }
    if (fixed.length === holes.length) break;
    holes.length = 0; holes.push(...fixed);
  }
  return { heard, steps, dt, plane, watch };
}

/* --------------------------------------------------------------------
   Putting the answer in units anyone can read
   -------------------------------------------------------------------- */

/* The number that comes out of `ring` is in whatever units the click and
   the grid happened to produce, which is no use to anybody. So solve one
   more room - a big one with every surface swallowing everything, which
   is what open air is - and see what this grid says the plain inverse
   square law looks like. Everything is then quoted against that: a
   reading of 1 means "as loud as a unit source one metre away, outdoors".

   It depends only on the cell size, so it is worked out once and kept. */
const yardsticks = new Map();
export function yardstick(cell) {
  if (yardsticks.has(cell)) return yardsticks.get(cell);
  /* an exact multiple, so carve does not round the cell to something else
     and calibrate the wrong grid */
  const side = cell * 40;
  const air = { size: side, sun: false, ground: { absorb: 0.99 },
                sky: { wallsAbsorb: 0.99, ceilingAbsorb: 0.99 }, furniture: [] };
  const room = carve(air, cell, side);
  const mid = Math.floor(room.ix / 2), midZ = Math.floor(room.iz / 2);
  const out = ring(room, { x: (mid + 0.5) * cell, y: (mid + 0.5) * cell,
                           z: (midZ + 0.5) * cell }, { plane: midZ, steps: 2000 });
  /* average several distances, so one unlucky cell cannot set the scale */
  let sum = 0, n = 0;
  for (let d = 6; d <= 10; d++) {
    const e = out.heard[mid * room.ix + (mid + d)];
    if (e > 0) { sum += e * (d * cell) * (d * cell); n++; }
  }
  const scale = n ? REF * REF / (sum / n) : 1;
  yardsticks.set(cell, scale);
  return scale;
}
