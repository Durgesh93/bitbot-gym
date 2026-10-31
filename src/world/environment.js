/* An Environment is a scene with its fields built on top, and it is the only
   thing a robot is ever allowed to ask about the world.

   SIX QUESTIONS. Every scene answers all six, and no scene answers anything
   else. That is the whole reason a new scene cannot break a robot:

     raycast(from, angle)     how far to the first solid thing, in mm
     lightAt(point, opts)     how much light falls there, in gym units
     soundAt(point, opts)     how loud it is there, 0 upwards
     surfaceAt(point)         what the floor is like underneath
     mediumAt()               the air: temperature, speed of sound, wind
     radioBetween(a, b)       how well two boards hear each other

   Plus the bookkeeping a tick needs: hand in where the bodies are, hand in
   what is beeping, then say the world has moved so the fields are rebuilt.

   Nothing here knows what a micro:bit is, what an LDR curve looks like, or
   what counts as "on the line". Those are the robot's business, and keeping
   them out is what lets the same robot work in a classroom and on grass. */

import { loadScene, makeThing, scatterThings, CATALOGUE } from "./scene.js";
import { createRandom } from "../core/random.js";
import { createMotion } from "./motion.js";
import { createLight } from "./fields/light.js";
import { createSound } from "./fields/sound.js";
import { createSurface } from "./fields/surface.js";
import { createMedium } from "./fields/medium.js";
import { createRadio } from "./fields/radio.js";

export function createEnvironment(data) {
  const scene = loadScene(data);
  const motion = createMotion(scene);
  const light = createLight(scene, motion);
  const sound = createSound(scene);
  const surface = createSurface(scene);
  const medium = createMedium(scene);
  const radio = createRadio(scene);

  /* Said once a tick, after the bodies have moved and before any sensor is
     read. It marks the fields stale rather than recomputing them on the spot,
     so a scene with no light sensor in it never pays for shadows. Nothing can
     change between here and the reads, so the answers are still the same for
     every sensor in the tick - which is what keeps a run repeatable. */
  let generation = 0;
  function moved() {
    light.stale();
    generation++;
  }

  /* The light the EYE sees, as a square of samples, for drawing the room.
     This is a different question from what a sensor reads: flat on the
     floor, looking straight up, and it wants the whole room at once. The
     renderer must not reach into the fields itself, so it asks here. */
  function lightMap(n) {
    const out = new Float32Array(n * n);
    const step = scene.size / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        out[j * n + i] = light.at({ x: (i + 0.5) * step, y: (j + 0.5) * step }, { z: 0 });
      }
    }
    return out;
  }

  return {
    name: scene.name,
    size: scene.size,
    scene: scene,

    raycast: (from, angle, opts) => motion.raycast(from, angle, opts),
    lightAt: (p, opts) => light.at(p, opts),
    soundAt: (p, opts) => sound.at(p, opts),
    surfaceAt: (p) => surface.at(p),
    mediumAt: () => medium.at(),
    radioBetween: (a, b) => radio.between(a, b),

    /* Bodies belong to matter.js now, so they are added and moved through
       here rather than handed over as a list. Anything that changes where
       something is says `moved()` on its way out, which is what marks the
       light field stale exactly once. */
    addBody(spec) { const b = motion.add(spec); moved(); return b; },
    removeBody(id) { const ok = motion.remove(id); if (ok) moved(); return ok; },
    holdBody(id, on) { return motion.hold(id, on); },
    placeBody(id, x, y, h) { const ok = motion.place(id, x, y, h); if (ok) moved(); return ok; },
    drive(id, vl, vr, axle) { return motion.drive(id, vl, vr, axle); },
    step(dt) { const out = motion.step(dt); moved(); return out; },
    bodies: () => motion.bodies(),
    bodyOf: (id) => motion.bodyOf(id),

    /* ---- editing the room ------------------------------------------------

       A room a child cannot change is a picture, not a room. Everything here
       goes through `moved()` on its way out, which is the one line that
       stops a stale shadow: the light field does not recompute when a chair
       appears, it only marks itself stale, and the next sensor to ask pays
       for it.

       scene.furniture and scene.lines stay the single truth. motion keeps
       matter.js in step with the first and surface keeps its own read-shaped
       copy of the second, so there is never a second list to disagree. */

    catalogue: () => Object.keys(CATALOGUE),

    /* `centred` is what a pointer means: the click is where the middle of
       the thing should sit. The catalogue measures from a corner, so take
       half its size off - otherwise everything a child places lands down
       and right of where they pointed, which looks like a bug and is one. */
    addThing(name, x, y, rot, centred) {
      const base = CATALOGUE[name];
      if (!base) return null;
      const spec = makeThing({
        name: name, rot: rot || 0,
        x: centred ? x - base.w / 2 : x,
        y: centred ? y - base.h / 2 : y
      });
      scene.furniture.push(spec);
      if (spec.speaker) scene.speakers.push(spec);
      motion.addThing(spec);
      moved();
      return spec;
    },

    thingAt: (p) => motion.thingAt(p),

    removeThingAt(p) {
      const spec = motion.thingAt(p);
      if (!spec) return null;
      const i = scene.furniture.indexOf(spec);
      if (i >= 0) scene.furniture.splice(i, 1);
      const j = scene.speakers.indexOf(spec);
      if (j >= 0) scene.speakers.splice(j, 1);
      motion.removeThing(spec);
      moved();
      return spec;
    },

    /* Scatter a believable classroom. Seeded, so the same press twice in a
       test gives the same room and an assertion means something. */
    furnish(howMany, seed) {
      const rng = createRandom(seed == null ? 20261031 : seed);
      const made = scatterThings(scene, rng, howMany);
      for (const spec of made) {
        scene.furniture.push(spec);
        if (spec.speaker) scene.speakers.push(spec);
        motion.addThing(spec);
      }
      moved();
      return made;
    },

    /* Empty the room, but never of its walls or its lamps: a child pressing
       this wants the floor clear, not the lights off. */
    clearThings() {
      const n = scene.furniture.length;
      scene.furniture.length = 0;
      scene.speakers.length = 0;
      motion.clearThings();
      moved();
      return n;
    },

    /* ---- tape on the floor ---------------------------------------------- */

    addLine(from, to, width) {
      const l = { from: [from.x, from.y], to: [to.x, to.y], width: width || 30 };
      scene.lines.push(l);
      surface.rebuild();
      moved();
      return l;
    },

    /* Erase by touching, the way a rubber works, rather than by picking a
       line out of a list - the child is pointing at the floor. */
    eraseLineAt(p, radius) {
      const r = radius == null ? 45 : radius;
      const keep = scene.lines.filter(l => {
        const a = { x: l.from[0], y: l.from[1] }, b = { x: l.to[0], y: l.to[1] };
        const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
        let t = len2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
        return d > r + l.width / 2;
      });
      const gone = scene.lines.length - keep.length;
      if (!gone) return 0;
      scene.lines.length = 0;
      for (const l of keep) scene.lines.push(l);
      surface.rebuild();
      moved();
      return gone;
    },

    clearLines() {
      const n = scene.lines.length;
      if (!n) return 0;
      scene.lines.length = 0;
      surface.rebuild();
      moved();
      return n;
    },

    lightMap,
    generation: () => generation,
    setEmitters(list) { sound.setEmitters(list); },
    moved,
    contacts: (body) => motion.contacts(body),
    starts: () => scene.start.map(s => ({ ...s })),

    /* Everything the view needs and nothing it does not, as one object per
       tick. No component reaches into the model, so no component can be the
       one that quietly corrupts it.

       It must be plain data all the way down, with no reference back to a
       device: the snapshot is what crosses into a Web Worker, or into React,
       and anything that cannot survive being copied cannot go in it. That is
       why a body is projected down to its numbers here rather than handed
       over whole. */
    snapshot() {
      return {
        name: scene.name,
        size: scene.size,
        walls: scene.walls,
        ground: scene.ground.material,
        furniture: scene.furniture,
        lamps: scene.lamps,
        speakers: scene.speakers,
        lines: surface.lines(),
        sun: scene.sun,
        ambient: light.ambient(),
        /* One entry per light source: where it is, the lit region it can see,
           and the shadows of everything shorter than it. The renderer draws
           from exactly this, so the picture and the sensor readings are built
           from the same polygons and cannot drift apart. */
        light: light.regions().map(r => ({
          source: { ...r.source },
          quads: r.quads,
          visible: r.visible,
          profile: r.profile
        })),
        bodies: motion.bodies().map(b => ({
          id: b.id, x: b.x, y: b.y, h: b.h, r: b.r, z: b.z,
          held: !!b.held, speed: b.speed
        }))
      };
    },

    /* For tests and for the room editor, which needs to poke at one field. */
    fields: { motion, light, sound, surface, medium, radio }
  };
}
