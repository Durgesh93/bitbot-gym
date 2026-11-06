/* The sound field: how loud it is at one spot.

   Sources are the scene's speakers and, handed in fresh every tick,
   whatever is beeping: a board hears its own buzzer loud and clear and its
   neighbour's faintly, which is exactly how a classroom full of micro:bits
   sounds.

   The robot's own gearboxes are NOT in here. They sit under the microphone
   on the board itself, so they belong to the device, not the room.

   THIS FIELD IS A WAVE, and it is the only field in here that can afford
   to be. It used to be three laws in a trenchcoat - an inverse square for
   the straight path, Maekawa's barrier formula for anything in the way,
   and a bounced-energy solve for the room's ring - each one a separate
   approximation of the same single thing. Now the air is simulated
   directly, in wave.js, and all three fall out of it on their own: the
   quiet far corner, the soft-edged shadow behind a cupboard, the ring of
   a bare room, the deadness of a carpeted one. See wave.js for why sound
   can be done this way and light cannot.

   WHAT THAT COST AND HOW IT IS PAID. A solve walks the whole room forward
   in time and takes a fraction of a second - far too slow for every tick.
   But one solve answers for EVERY point at once, so the cost is per
   SOURCE, and a speaker that has not moved never needs solving twice.
   Each source keeps its own answer, and they are added up on demand. */

import { carve, ring, yardstick } from "./wave.js";
import { ROOM_HEIGHT } from "./transport.js";

/* Six centimetres resolves every note a micro:bit can buzz - the grid
   carries sound down to about a third of a metre in wavelength, and the
   buzzer's top note is a third of a metre. Finer would be slower and
   would not tell a child anything new. */
const CELL = 60;
const EARS = 95;                 // a robot's microphone is about this far up
const REF = 1000;                // the distance the wave field quotes itself at
const SPEAKER_Z = 280, BUZZER_Z = 60;
const REMEMBER = 48;             // how many solved source positions to keep

export function createSound(scene, opts) {
  const cell = (opts && opts.cell) || CELL;
  let emitters = [];             // {owner, x, y, loud, reach}
  let room = null, shapedFor = null;
  const solved = new Map();      // where a source stood -> what the room did

  const speakers = () => scene.speakers.filter(s => s.playing);

  function sources() {
    const out = [];
    /* A SPEAKER SPEAKS FROM ITS MIDDLE. Furniture is measured from a
       corner - that is what every box in the catalogue means by x, y - and
       reading those two numbers as the source put the sound a hand's
       breadth out of the cabinet, through its own front. */
    for (const s of speakers())
      out.push({ x: s.x + s.w / 2, y: s.y + s.h / 2, z: s.z == null ? SPEAKER_Z : s.z,
                 loud: s.loud, reach: s.reach, owner: null });
    /* A micro:bit's buzzer is a sliver of metal the size of a fingernail.
       It is piercing right next to you and unremarkable across a room,
       which is what these two numbers say: 45 at a quarter of a metre,
       out in the open. */
    for (const e of emitters)
      out.push({ x: e.x, y: e.y, z: e.z == null ? BUZZER_Z : e.z,
                 loud: e.loud == null ? 45 : e.loud,
                 reach: e.reach == null ? 260 : e.reach, owner: e.owner });
    return out;
  }

  /* The room has to be cut into cells again whenever its shape or its
     materials change - which is when furniture moves, and almost never
     otherwise. Everything solved in the old room is wrong in the new one. */
  function shapeKey() {
    let k = scene.w + "x" + scene.h + "|" + scene.ground.absorb + "|" + (scene.sun ? "out" : "in") +
            "|" + scene.sky.wallsAbsorb + "," + scene.sky.ceilingAbsorb;
    for (const f of scene.furniture)
      k += "|" + Math.round(f.x) + "," + Math.round(f.y) + "," + f.w + "," + f.h +
           "," + (f.z || 0) + "," + (f.rot || 0).toFixed(3) + "," + f.absorb +
           "," + (f.round ? "o" : "#");
    return k;
  }

  function theRoom() {
    const k = shapeKey();
    if (k !== shapedFor) { shapedFor = k; room = carve(scene, cell, ROOM_HEIGHT); solved.clear(); }
    return room;
  }

  /* What the room does with a click from here. Kept against the CELL the
     source stands in, not its exact spot: a robot creeping six centimetres
     across the floor has not changed the answer in any way a microphone
     could tell, and re-solving for it would be the most expensive thing
     in the gym. */
  function responseTo(s) {
    const r = theRoom();
    const key = Math.floor(s.x / r.cell) + "," + Math.floor(s.y / r.cell) + "," +
                Math.floor(s.z / r.cell);
    let got = solved.get(key);
    if (!got) {
      const out = ring(r, s, { plane: Math.round(EARS / r.cell) });
      const scale = yardstick(r.cell);
      got = out.heard;
      for (let i = 0; i < got.length; i++) got[i] *= scale;
      if (solved.size >= REMEMBER) solved.delete(solved.keys().next().value);
      solved.set(key, got);
    }
    return got;
  }

  /* Read the grid the way a sensor would: smoothly, between cells, so a
     robot rolling along does not read in steps. */
  function look(field, x, y) {
    const r = room, n = r.ix;                  // n is the ROW STRIDE, not the depth
    const u = Math.max(0, Math.min(r.ix - 1.001, x / r.cell - 0.5));
    const v = Math.max(0, Math.min(r.iy - 1.001, y / r.cell - 0.5));
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    const a = field[j * n + i], b = field[j * n + i + 1];
    const c = field[(j + 1) * n + i], d = field[(j + 1) * n + i + 1];
    return a + (b - a) * fx + (c - a) * fy + (d + a - b - c) * fx * fy;
  }

  function at(p, opts) {
    const o = opts || {};
    let v = 0;
    for (const s of sources()) {
      /* its own buzzer is pressed against its own microphone: there is no
         room in between to take anything away */
      if (o.self != null && s.owner === o.self) { v += 255; continue; }
      /* `loud` MEANS: what a microphone reads at `reach` millimetres from
         this source, out in the open with nothing to bounce off. The wave
         field answers for one unit at one metre, so squaring the two up
         is all that is needed here and the room does the rest - which is
         why every reading indoors comes out higher than `loud` suggests,
         and should. */
      const power = s.loud * (s.reach / REF) * (s.reach / REF);
      v += power * look(responseTo(s), p.x, p.y);
    }
    return v;
  }

  return {
    at,
    setEmitters(list) { emitters = list || []; },
    emitters: () => emitters,
    speakers,
    /* the whole field on a grid, for anyone who wants to look at it */
    field: () => { const list = sources(); if (!list.length) return null;
                   const r = theRoom(); const out = new Float32Array(r.ix * r.iy);
                   for (const s of list) {
                     const g = responseTo(s), power = s.loud * (s.reach / REF) * (s.reach / REF);
                     for (let i = 0; i < out.length; i++) out[i] += power * g[i];
                   }
                   return { grid: out, n: r.ix, ny: r.iy, cell: r.cell }; },
    stale() { shapedFor = null; solved.clear(); }
  };
}
