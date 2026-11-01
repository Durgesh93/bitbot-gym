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

import { loadScene, makeThing, makeLamp, makeMagnet, scatterThings, CATALOGUE } from "./scene.js";
import { createRandom } from "../core/random.js";
import { createMotion } from "./motion.js";
import { createLight } from "./fields/light.js";
import { createSound } from "./fields/sound.js";
import { createMagnetic } from "./fields/magnetic.js";
import { createSurface } from "./fields/surface.js";
import { createMedium } from "./fields/medium.js";
import { createRadio } from "./fields/radio.js";

/* SOMEWHERE IT IS NOT ALREADY STANDING.

   Everything the Room menu puts in the room is aimed at the middle of it,
   which is fine for the first one and wrong for the second: add a lamp and
   then a speaker and they arrive on the same square millimetre. The box
   swallows the lamp, the room goes dark because the lamp is now shining
   from inside it, and the lamp can never be picked up again because the
   pointer finds the box first. Walk outwards a ring at a time, eight
   places round each ring, until there is a clear patch - the same way a
   robot finds room at a crowded start line.

   WHAT HAS TO BE DODGED DEPENDS ON WHAT IS ARRIVING, and the ceiling is
   the reason. A box on the floor and a light hanging over it are not in
   each other's way at all, so a speaker steps round a standing lamp and
   ignores a ceiling one; a ceiling light only has to miss the other
   lights. What every case shares is lamps against lamps: they are at
   different heights but the pointer works in plan, and two dots on one
   spot are one dot - whichever the grab radius finds first is the one
   that moves, so a child drags the ceiling light while watching the floor
   lamp and decides the gym is broken. */
function clearSpot(scene, x, y, w, h, dodge) {
  const boxes = dodge.furniture !== false;
  const taken = (cx, cy) => {
    if (boxes) {
      for (const f of scene.furniture)
        if (Math.abs(cx - (f.x + f.w / 2)) < (w + f.w) / 2 + 40 &&
            Math.abs(cy - (f.y + f.h / 2)) < (h + f.h) / 2 + 40) return true;
    }
    for (const L of scene.lamps)
      if ((dodge.lamps === "all" || L.kind !== "ceiling") &&
          Math.hypot(cx - L.x, cy - L.y) < Math.max(w, h) / 2 + 90) return true;
    /* Magnets count as something already standing there even though nothing
       bumps into them, because the point of dodging is that a child can SEE
       and GRAB both things. Two of them on the same pixel is one magnet as
       far as the room is concerned. */
    if (dodge.magnets !== false)
      for (const M of scene.magnets || [])
        if (Math.hypot(cx - M.x, cy - M.y) < Math.max(w, h) / 2 + 80) return true;
    return false;
  };
  if (!taken(x, y)) return { x, y };
  const step = Math.max(w, h) + 110;
  for (let ring = 1; ring <= 6; ring++) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * ring * step, py = y + Math.sin(a) * ring * step;
      if (px > w / 2 + 60 && py > h / 2 + 60 &&
          px < scene.size - w / 2 - 60 && py < scene.size - h / 2 - 60 &&
          !taken(px, py)) return { x: px, y: py };
    }
  }
  return { x, y };
}

export function createEnvironment(data) {
  const scene = loadScene(data);
  const motion = createMotion(scene);
  const light = createLight(scene, motion);
  const sound = createSound(scene);
  const surface = createSurface(scene);
  const medium = createMedium(scene);
  const radio = createRadio(scene);
  const magnetic = createMagnetic(scene);

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
    magneticAt: (p, opts) => magnetic.at(p, opts),

    /* Bodies belong to matter.js now, so they are added and moved through
       here rather than handed over as a list. Anything that changes where
       something is says `moved()` on its way out, which is what marks the
       light field stale exactly once. */
    addBody(spec) { const b = motion.add(spec); moved(); return b; },
    removeBody(id) { const ok = motion.remove(id); if (ok) moved(); return ok; },
    resizeBody(id, r) { const ok = motion.resize(id, r); if (ok) moved(); return ok; },
    setGrip: (v) => motion.setGrip(v),
    grip: () => motion.grip(),
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
    thingBy: (uid) => scene.furniture.find(f => f.uid === uid) || null,

    /* Moving and turning one thing. Matter owns a rigid body, not a thing
       whose corners move, so the body is taken out and put back rather than
       nudged - which at furniture prices is cheaper than it sounds and is
       the only way the collision shape stays honest after a turn. */
    moveThing(uid, x, y, centred) {
      const spec = scene.furniture.find(f => f.uid === uid);
      if (!spec) return null;
      motion.removeThing(spec);
      spec.x = centred ? x - spec.w / 2 : x;
      spec.y = centred ? y - spec.h / 2 : y;
      motion.addThing(spec);
      moved();
      return spec;
    },

    turnThing(uid, rot) {
      const spec = scene.furniture.find(f => f.uid === uid);
      if (!spec) return null;
      motion.removeThing(spec);
      spec.rot = rot;
      motion.addThing(spec);
      moved();
      return spec;
    },

    /* Another one of these, set down a little below and to the right so it
       is obviously a second thing and not the first one that failed to
       move. */
    copyThing(uid, dx, dy) {
      const spec = scene.furniture.find(f => f.uid === uid);
      if (!spec) return null;
      const twin = makeThing({ ...spec, uid: null,
                               x: spec.x + (dx == null ? 110 : dx),
                               y: spec.y + (dy == null ? 110 : dy) });
      scene.furniture.push(twin);
      if (twin.speaker) scene.speakers.push(twin);
      motion.addThing(twin);
      moved();
      return twin;
    },

    removeThing(uid) {
      const spec = scene.furniture.find(f => f.uid === uid);
      if (!spec) return null;
      scene.furniture.splice(scene.furniture.indexOf(spec), 1);
      const j = scene.speakers.indexOf(spec);
      if (j >= 0) scene.speakers.splice(j, 1);
      motion.removeThing(spec);
      moved();
      return spec;
    },

    /* A lamp is not a body - nothing bumps into it - so it only has to tell
       the light field it has changed. */

    /* You could always move a lamp and take one away, but never put one in,
       which left the room with whatever its scene happened to hang and no
       way to light a thing from two sides. A ceiling light shines straight
       down from above everything; a floor lamp stands in the room at about
       the height of a table, so what it lights and what it leaves dark are
       the room's own geometry. */
    addLamp(x, y, kind) {
      const at = clearSpot(scene, x, y, 160, 160,
                           kind === "ceiling" ? { furniture: false, lamps: "all" }
                                              : { furniture: true, lamps: "all" });
      const L = makeLamp({ x: at.x, y: at.y, kind: kind || "floor", on: true });
      scene.lamps.push(L);
      moved();
      return L;
    },

    /* A magnet goes under a table happily - it works straight through one,
       which is half of what makes it interesting - so it dodges no
       furniture on the way in. It does dodge the other things that arrive
       from the Room menu, because they all aim at the exact middle of the
       room and the second arrival would otherwise land on the first. */
    addMagnet(x, y, rot) {
      const at = clearSpot(scene, x, y, 120, 120, { furniture: false, lamps: "all" });
      const M = makeMagnet({ x: at.x, y: at.y, rot: rot || 0 });
      scene.magnets.push(M);
      moved();
      return M;
    },

    moveMagnet(i, x, y) {
      const M = scene.magnets[i];
      if (!M) return null;
      M.x = x; M.y = y;
      moved();
      return M;
    },

    turnMagnet(i, rot) {
      const M = scene.magnets[i];
      if (!M) return null;
      M.rot = rot;
      moved();
      return M;
    },

    removeMagnet(i) {
      const M = scene.magnets[i];
      if (!M) return null;
      scene.magnets.splice(i, 1);
      moved();
      return M;
    },

    moveLamp(i, x, y) {
      const L = scene.lamps[i];
      if (!L) return null;
      L.x = x; L.y = y;
      moved();
      return L;
    },

    /* A speaker could be switched on and off and never put in, so a room
       was stuck with whatever its scene happened to stand there - and the
       scenes stand none at all except the classroom's one in the corner.
       It is a thing in the room as well as a source, so it goes in through
       the furniture door and gets listed in both places, which is what
       `thingAt` and the drag handles already expect of it. */
    addSpeaker(x, y) {
      const box = CATALOGUE.speaker;
      const at = clearSpot(scene, x, y, box.w, box.h,
                           { furniture: true, lamps: "standing" });
      const spec = this.addThing("speaker", at.x, at.y, 0, true);
      if (spec) spec.playing = true;
      moved();
      return spec;
    },

    removeLamp(i) {
      const L = scene.lamps[i];
      if (!L) return null;
      scene.lamps.splice(i, 1);
      moved();
      return L;
    },

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
        /* Copied, not handed over. These were the live arrays, and a
           photograph that goes on changing after it is taken is not a
           photograph: a caller holding "the lamps before" was holding the
           lamps after as well, and could not tell. Thirty small objects a
           tick is nothing beside the light field they sit in. */
        furniture: scene.furniture.map(f => ({ ...f })),
        lamps: scene.lamps.map(L => ({ ...L })),
        magnets: scene.magnets.map(M => ({ ...M })),
        speakers: scene.speakers.map(S => ({ ...S })),
        lines: surface.lines(),
        sun: scene.sun,
        ambient: light.ambient(),
        /* the room's own bounced light, on a grid: what fills a shadow */
        indirect: light.indirect(),
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
    fields: { motion, light, sound, surface, medium, radio, magnetic }
  };
}
