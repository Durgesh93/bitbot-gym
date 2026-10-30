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

import { loadScene } from "./scene.js";
import { createGeometry } from "./fields/geometry.js";
import { createLight } from "./fields/light.js";
import { createSound } from "./fields/sound.js";
import { createSurface } from "./fields/surface.js";
import { createMedium } from "./fields/medium.js";
import { createRadio } from "./fields/radio.js";

export function createEnvironment(data) {
  const scene = loadScene(data);
  const geometry = createGeometry(scene);
  const light = createLight(scene, geometry);
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

    raycast: (from, angle, opts) => geometry.raycast(from, angle, opts),
    lightAt: (p, opts) => light.at(p, opts),
    soundAt: (p, opts) => sound.at(p, opts),
    surfaceAt: (p) => surface.at(p),
    mediumAt: () => medium.at(),
    radioBetween: (a, b) => radio.between(a, b),

    setBodies(list) { geometry.setBodies(list); moved(); },
    lightMap,
    generation: () => generation,
    setEmitters(list) { sound.setEmitters(list); },
    moved,
    contacts: (body) => geometry.contacts(body),
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
        sources: light.sources().map(s => ({ ...s })),
        shadows: light.shadows().map(set => set.map(e => ({ poly: e.poly }))),
        bodies: geometry.bodies().map(b => ({
          id: b.id, x: b.x, y: b.y, h: b.h, r: b.r, z: b.z, held: !!b.held
        }))
      };
    },

    /* For tests and for the room editor, which needs to poke at one field. */
    fields: { geometry, light, sound, surface, medium, radio }
  };
}
