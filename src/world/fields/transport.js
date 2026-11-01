/* How a room passes energy around, by bouncing it off its own surfaces.

   Light and sound are the same problem. Something emits; it travels in
   straight lines; it meets a surface; some of it is swallowed and the rest
   is thrown back into the room in every direction; and that goes round
   again. A classroom is almost entirely diffuse - matt paint, lino,
   wooden tables, nothing mirrored - which is the case this file solves, and
   it is the case radiosity was invented for.

   WHY NOT A LIBRARY. Every global-illumination package in JavaScript is a
   three.js renderer: WebGL or WebGPU, and it gives you PIXELS. A robot's
   light sensor does not want a picture. It wants "how much is falling on
   this point, facing this way", in node, with no GPU, the same answer every
   run, sixty times a second. That is a different question, and the only
   library worth having for it is the ray intersection underneath - which the
   gym already has in @flatten-js/core for the exact ray distances the sonar
   needs. The visibility test here is a plain segment crossing because it is
   asked a million times in a rebuild and a hand-written one is an order of
   magnitude faster than constructing objects to ask it.

   WHAT IT DOES, in three steps:

     1. Cut the room into patches. Floor, ceiling, the four walls, and every
        face of every piece of furniture. Each patch has a place, a normal,
        an area, and how much of what lands on it it throws back.

     2. Work out what reaches each patch straight from the sources, then let
        the patches throw it at each other until it settles. Two patches can
        only exchange anything if they can SEE each other, which is where the
        rays come in: one per pair, per bounce - cached, because geometry does
        not change between bounces.

     3. Bake the answer onto a grid, because a sensor asks sixty times a
        second and gathering a hundred patches each time would cost more than
        the whole rest of the gym. Indirect energy is smooth - that is its
        nature, it has been averaged by every surface it touched - so a grid
        with a direction on it carries it with no visible error.

   The DIRECT term is not in here. It stays exact, per query, in the field
   that owns it: it is the sharp part, and sharp things must not be baked. */

import { boxCorners, boxCentre, boxContains } from "../../core/geom.js";

/* How a wall throws energy back, when the scene does not say. */
export const ROOM_HEIGHT = 2500;

/* ========================================================================
   The ray. Can these two points see each other?
   ======================================================================== */

/* Every box becomes four upright faces AND A LID. A line is blocked when it
   crosses one of the sides on the ground and is still below its top where it
   crosses - which is the whole of 2.5D: a robot drives under nothing, but a
   lamp at 2.5 m sees straight over a 240 mm table.

   The lid is not a nicety. Without it the test only knew about upright
   faces, so a point on the floor UNDER a table could see the ceiling
   straight through the tabletop, and the floor under the table came back
   almost as bright as the floor beside it. A ray going nearly straight up
   also defeats the side test on its own - two parallel 2D points give no
   crossing to find - so the lid is what catches it. */
export function makeSight(boxes) {
  const segs = [], lids = [];
  for (const c of boxes) {
    const v = boxCorners(c.box);
    const z = c.box.z || 200;
    for (let i = 0, j = 3; i < 4; j = i++) {
      segs.push({ ax: v[j].x, ay: v[j].y, ex: v[i].x - v[j].x, ey: v[i].y - v[j].y,
                  z: z, owner: c.owner });
    }
    lids.push({ bx: c.box, z: z, owner: c.owner });
  }
  /* Solving  a + t(b-a) = s + u e  by Cramer's rule. A hit inside both
     spans (0<t<1, 0<u<1) that is lower than the face's top blocks. */
  return function clear(a, b, skipA, skipB) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k];
      if ((skipA != null && s.owner === skipA) || (skipB != null && s.owner === skipB)) continue;
      const det = s.ex * dy - dx * s.ey;
      if (det === 0) continue;                       // parallel
      const rx = s.ax - a.x, ry = s.ay - a.y;
      const t = (s.ex * ry - s.ey * rx) / det;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      const u = (dx * ry - dy * rx) / det;
      if (u < 0 || u > 1) continue;
      if (a.z + dz * t < s.z) return false;
    }
    if (dz !== 0) {
      for (let k = 0; k < lids.length; k++) {
        const L = lids[k];
        if ((skipA != null && L.owner === skipA) || (skipB != null && L.owner === skipB)) continue;
        const t = (L.z - a.z) / dz;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        if (boxContains(L.bx, { x: a.x + dx * t, y: a.y + dy * t })) return false;
      }
    }
    return true;
  };
}

/* WHERE a line passes through one box, rather than merely whether. Sound
   needs this: it does not stop at an obstacle, it goes over the top, and
   how much that costs depends on how much further it has to travel - so
   the point it goes over has to be found, not assumed.

   Returns the middle of the stretch the line spends inside the box, as a
   fraction along it, or -1 if it never goes in. */
export function crossing(a, b, box) {
  const v = boxCorners(box);
  const dx = b.x - a.x, dy = b.y - a.y;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const ex = v[i].x - v[j].x, ey = v[i].y - v[j].y;
    const det = ex * dy - dx * ey;
    if (det === 0) continue;
    const rx = v[j].x - a.x, ry = v[j].y - a.y;
    const t = (ex * ry - ey * rx) / det;
    const u = (dx * ry - dy * rx) / det;
    if (u < 0 || u > 1 || t < 0 || t > 1) continue;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (lo === Infinity) {
    /* no edge crossed: either it misses entirely, or it lies wholly inside */
    return boxContains(box, a) ? 0.5 : -1;
  }
  if (hi === lo) {                       // one edge only: an end is inside
    if (boxContains(box, a)) lo = 0; else hi = 1;
  }
  return (lo + hi) / 2;
}

/* ========================================================================
   The patches
   ======================================================================== */

/* `give` says how much of what lands on a surface it gives back: reflectance
   for light, one-minus-absorption for sound. It is asked for the ground, for
   the walls, and for each piece of furniture, so one set of geometry serves
   both fields with nothing in common but the shape of the room. */
export function surfacesOf(scene, give, opts) {
  const o = opts || {};
  const S = scene.size;
  const H = o.height == null ? ROOM_HEIGHT : o.height;
  const indoor = o.indoor !== false;
  const N = o.floor || 6;                    // floor and ceiling are N x N
  const M = o.wall || 6;                     // each wall is M strips
  const out = [];
  const add = (x, y, z, nx, ny, nz, mm2, g, owner) => {
    if (g > 0.01 && mm2 > 0) out.push({ x, y, z, nx, ny, nz, A: mm2 / 1e6, g, owner, B: 0, E: 0 });
  };

  const cell = S / N, area = cell * cell;
  /* The ceiling is its own surface and not just another wall. In a school
     it is the one that has been treated - acoustic tile, because the
     regulations say so - and it is the single biggest thing deciding
     whether a classroom rings. */
  const gFloor = give.ground, gWall = give.walls;
  const gCeil = give.ceiling == null ? give.walls : give.ceiling;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      add(cell * (i + 0.5), cell * (j + 0.5), 0, 0, 0, 1, area, gFloor, null);
      if (indoor) add(cell * (i + 0.5), cell * (j + 0.5), H, 0, 0, -1, area, gCeil, null);
    }
  }
  if (indoor) {
    const wide = S / M, face = wide * H;
    for (let k = 0; k < M; k++) {
      const c = wide * (k + 0.5);
      add(c, 2, H / 2, 0, 1, 0, face, gWall, null);          // the north wall looks south
      add(c, S - 2, H / 2, 0, -1, 0, face, gWall, null);
      add(2, c, H / 2, 1, 0, 0, face, gWall, null);
      add(S - 2, c, H / 2, -1, 0, 0, face, gWall, null);
    }
  }

  /* Furniture: four upright faces and a top. One patch per face is enough -
     these are small next to a room, and the direction is what matters. */
  for (const bx of scene.furniture) {
    const g = give.thing(bx);
    if (g <= 0.01) continue;
    const z = Math.max(20, bx.z || 100);
    const c = boxCentre(bx);
    const v = boxCorners(bx);
    for (let i = 0; i < 4; i++) {
      const a = v[i], b = v[(i + 1) % 4];
      const wide = Math.hypot(b.x - a.x, b.y - a.y);
      if (wide < 1) continue;
      let nx = -(b.y - a.y) / wide, ny = (b.x - a.x) / wide;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if ((mx - c.x) * nx + (my - c.y) * ny < 0) { nx = -nx; ny = -ny; }
      /* a hair proud of the face, so it is not inside its own geometry */
      add(mx + nx * 2, my + ny * 2, z / 2, nx, ny, 0, wide * z, g, bx);
    }
    add(c.x, c.y, z + 2, 0, 0, 1, bx.w * bx.h, g, bx);
  }
  return out;
}

/* ========================================================================
   The bounce
   ======================================================================== */

/* Patch to patch, once, and kept. The pair term is

       cos(at i) x cos(at j) x area(j) / (pi d^2)

   which is the fraction of everything patch j throws out that lands on a
   unit of patch i. Geometry does not change while the energy settles, so
   this is built once and every bounce reads it. Pairs that cannot see each
   other are simply absent, which is what makes the table stop lighting its
   own shadow. */
function pairs(P, sight) {
  const rows = [];
  for (let i = 0; i < P.length; i++) rows.push([]);
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    for (let j = i + 1; j < P.length; j++) {
      const b = P[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const mm2 = dx * dx + dy * dy + dz * dz;
      if (mm2 < 100) continue;
      const d = Math.sqrt(mm2);
      const ux = dx / d, uy = dy / d, uz = dz / d;
      const ca = a.nx * ux + a.ny * uy + a.nz * uz;            // i looking at j
      if (ca <= 0) continue;
      const cb = -(b.nx * ux + b.ny * uy + b.nz * uz);         // j looking back
      if (cb <= 0) continue;
      if (!sight(a, b, a.owner, b.owner)) continue;
      /* A disc of area A, not a point: its form factor is A/(pi d^2 + A),
         which is the real one and goes to 1 as you press your face against
         it instead of to infinity. A flat fudge in the denominator was
         tried first and it made the patch under a sensor's nose shout. */
      const m2 = mm2 / 1e6, ca_cb = ca * cb;
      rows[i].push(j, ca_cb * b.A / (Math.PI * m2 + b.A));       // what j sends i
      rows[j].push(i, ca_cb * a.A / (Math.PI * m2 + a.A));       // and i sends j
    }
  }
  return rows;
}

/* And patch to listening-point, for every point on the grid. Same term, and
   the same ray, and it is kept for the same reason: a robot beeps on a
   different tick from the one before, but the room it beeps in has not
   moved, so the only thing that has to be redone is the arithmetic.

   Three weights per pair, not one: the scalar, and the direction it came
   from, so a tilted sensor can tell left from right. See `sample`. */
function gathers(P, scene, sight, G, cellmm, z, closed) {
  const rows = [];
  const at = { x: 0, y: 0, z: z };
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      at.x = cellmm * (gx + 0.5); at.y = cellmm * (gy + 0.5);
      const r = [];
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        const dx = p.x - at.x, dy = p.y - at.y, dz = p.z - at.z;
        const mm2 = dx * dx + dy * dy + dz * dz;
        if (mm2 < 100) continue;
        const d = Math.sqrt(mm2);
        const ux = dx / d, uy = dy / d, uz = dz / d;
        const c1 = -(p.nx * ux + p.ny * uy + p.nz * uz);     // the patch looking back
        if (c1 <= 0) continue;
        if (!sight(at, p, null, p.owner)) continue;
        r.push(i, c1 * p.A / (Math.PI * mm2 / 1e6 + p.A), ux, uy, uz);
      }
      /* NORMALISED, and that is what makes the number mean something.

         Inside a closed room every direction you look at ends on some
         patch, so the shares must add to one and the answer is then the
         average of what those patches are throwing back - exactly right
         when they are all throwing back the same, which is the one case
         with an answer to check against. Deriving the constant from the
         ideal 4 pi instead was tried and it was wrong by a factor of
         three, because a hundred flat patches do not add up to a sphere.
         Taking it from the patches you actually have cannot drift.

         Outdoors there is no enclosure - most of what you would see is
         sky - so the shares are left as they come and the ground is all
         that answers. */
      if (closed) {
        let sum = 0;
        for (let k = 1; k < r.length; k += 5) sum += r[k];
        if (sum > 1e-9) for (let k = 1; k < r.length; k += 5) r[k] /= sum;
      }
      rows.push(r);
    }
  }
  return rows;
}

/* ========================================================================
   The two halves: geometry once, sources every time
   ======================================================================== */

/* EVERYTHING EXPENSIVE IS IN HERE, and none of it depends on a single lamp
   or a single beep. Cutting the room up, and casting a ray between every
   pair of patches and from every patch to every listening point, is tens of
   milliseconds. Working out what the sources put into it afterwards is a
   fraction of one. So they are separate, and this half is kept until the
   furniture actually moves - which is what lets the sound field, whose
   sources change sixty times a second, afford a bounce model at all. */
export function prepare(scene, give, boxes, opts) {
  const o = opts || {};
  const sight = makeSight(boxes);
  const P = surfacesOf(scene, give, o);
  const G = o.grid || 14;
  const cellmm = scene.size / G;
  return {
    P: P, rows: pairs(P, sight),
    gather: gathers(P, scene, sight, G, cellmm, o.z == null ? 40 : o.z,
                    o.indoor !== false),
    G: G, cell: cellmm, size: scene.size
  };
}

/* Let it settle, then write down what arrives where.

   Gauss-Seidel, which for this is just "go round again until it stops
   changing". Four passes is past the point where a classroom moves in the
   third digit: each pass is another bounce, and a room that gives back half
   of what it gets has lost 94% of the energy by then. */
export function illuminate(prep, incident, bounces) {
  const P = prep.P;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    p.E = incident(p);
    p.B = p.g * p.E;
  }
  const n = bounces == null ? 4 : bounces;
  const rows = prep.rows;
  for (let pass = 0; pass < n; pass++) {
    for (let i = 0; i < P.length; i++) {
      const r = rows[i];
      let got = 0;
      for (let k = 0; k < r.length; k += 2) got += P[r[k]].B * r[k + 1];
      P[i].B = P[i].g * (P[i].E + got);
    }
  }

  /* and onto the grid. Indirect energy is smooth - that is its nature, it
     has been averaged by every surface it touched - so a coarse grid with a
     direction on it carries it with no visible error, and a sensor asking
     sixty times a second gets an interpolated read instead of a hundred
     rays. The SHARP part, straight from the source, is never baked: it stays
     exact, per query, in the field that owns it. */
  const N = prep.G * prep.G;
  const sc = new Float32Array(N), vx = new Float32Array(N),
        vy = new Float32Array(N), vz = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    const r = prep.gather[c];
    let s = 0, ax = 0, ay = 0, az = 0;
    for (let k = 0; k < r.length; k += 5) {
      const e = P[r[k]].B * r[k + 1];
      if (e === 0) continue;
      s += e; ax += e * r[k + 2]; ay += e * r[k + 3]; az += e * r[k + 4];
    }
    sc[c] = s; vx[c] = ax; vy[c] = ay; vz[c] = az;
  }
  return { G: prep.G, cell: prep.cell, size: prep.size, s: sc, vx: vx, vy: vy, vz: vz };
}

/* Read the bake back, between the grid points. Bilinear, because a seam
   where one cell meets the next would show up as a stripe on the floor and
   as a step in a sensor reading as a robot drove over it.

   Two numbers per cell and not one: a scalar for how much is arriving in
   total, and a vector for which way most of it is coming from. A robot's eye
   is tilted, and light that bounced in from the left should read brighter on
   a left-facing eye than on a right-facing one. With just the scalar every
   eye would read the same and turning on the spot would do nothing, which is
   the thing the sensors are for.

       E(normal)  =  S  +  (R . normal) / 2

   S being the share-weighted average of what the room is throwing back,
   because the shares were normalised when they were built. Check it on the
   case that has an answer: in a room whose surfaces all throw back the
   same amount B, S = B and R = 0, and the formula gives B. Lean one
   direction and you get up to half as much again, and up to half as much
   less facing away - which is what lets two eyes on one robot disagree
   about which way the room is brighter.

   With no normal at all - a microphone, which points nowhere - it is just
   S, the same answer whichever way you hold it. */
export function sample(b, x, y, normal) {
  if (!b) return 0;
  const G = b.G;
  let fx = x / b.cell - 0.5, fy = y / b.cell - 0.5;
  fx = Math.max(0, Math.min(G - 1.001, fx));
  fy = Math.max(0, Math.min(G - 1.001, fy));
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
  const i00 = y0 * G + x0, i10 = i00 + 1, i01 = i00 + G, i11 = i01 + 1;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  const mix = a => a[i00] * w00 + a[i10] * w10 + a[i01] * w01 + a[i11] * w11;
  const s = mix(b.s);
  if (!normal) return s;
  const dot = mix(b.vx) * normal.x + mix(b.vy) * normal.y + mix(b.vz) * normal.z;
  return Math.max(0, s + dot * 0.5);
}
