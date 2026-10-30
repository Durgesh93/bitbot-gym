/* The room: the one thing that owns the world and the bodies in it.

   It is the only writer. Everything else - a child's blocks, a mouse drag, a
   React toggle - sends it a message and reads the snapshot back. That is what
   makes "flick the light on" simple: the UI holds no state of its own, so
   there is nothing to keep in sync and nothing to drift.

   One tick, in order:
     0. drain the posted queue      a mouse drop lands HERE, between ticks
     1. (programs run)              not yet: that is the hardware layer
     2. (devices -> forces)
     3. tell the world it moved     so the fields rebuild once
     4. (integrate, resolve)
     5. (devices sample sensors)    from the settled world
     6. hand out one snapshot

   Steps in brackets arrive with hardware/. The order is already fixed, so
   they drop in without moving anything else. */

import { bus as sharedBus } from "../core/bus.js";
import { random } from "../core/random.js";
import { DT, clock, resetClock, advance } from "../core/time.js";
import { createEnvironment } from "../world/environment.js";
import { SCENES, DEFAULT_SCENE } from "../world/scenes/index.js";

export const ROOM = "world";

export function createRoom(options) {
  const opts = options || {};
  const bus = opts.bus || sharedBus;
  const seed = opts.seed == null ? 20261030 : opts.seed;

  let sceneName = null;
  let env = null;
  let bodies = [];
  let emitters = [];
  let nextId = 1;
  const problems = [];      // posts that went nowhere or blew up, for the log

  function open(name) {
    const data = SCENES[name];
    if (!data) throw new Error("there is no scene called " + name);
    sceneName = name;
    env = createEnvironment(data);
    bodies = [];
    emitters = [];
    nextId = 1;
    random.reseed(seed);
    resetClock();
    return env;
  }

  /* Put a body down somewhere sensible: the scene's own start poses first,
     then anywhere clear. */
  function add(spec) {
    const s = spec || {};
    const starts = env.starts();
    const at = s.x != null ? s : (starts[bodies.length % starts.length] || starts[0]);
    const body = {
      id: s.id == null ? nextId++ : s.id,
      x: at.x, y: at.y, h: at.heading == null ? 0 : at.heading,
      r: s.r == null ? 62 : s.r,
      z: s.z == null ? 95 : s.z,
      held: false
    };
    bodies.push(body);
    env.setBodies(bodies);
    return body;
  }

  const find = id => bodies.find(b => b.id === id) || null;

  /* Every message the room takes. A sensor question is a `send` and comes
     back with a number; everything a human does is a `post` and lands on the
     next drain. */
  function handle(msg) {
    const m = msg || {};
    switch (m.cmd) {
      case "scene":   return open(m.name).name;
      case "add":     return add(m).id;
      case "remove":  bodies = bodies.filter(b => b.id !== m.id); env.setBodies(bodies); return true;

      /* A child picking a robot up with the mouse. Held means its wheels stop
         and its encoders do not jump, which is what the real thing does when
         you lift it off the floor. */
      case "hold": { const b = find(m.id); if (b) b.held = true; return !!b; }
      case "drop": { const b = find(m.id); if (b) b.held = false; return !!b; }
      case "place": {
        const b = find(m.id);
        if (!b) return false;
        b.x = m.x; b.y = m.y;
        if (m.heading != null) b.h = m.heading;
        env.setBodies(bodies);
        return true;
      }

      case "lamp": {
        const L = env.scene.lamps[m.id];
        if (!L) return false;
        L.on = m.on == null ? !L.on : !!m.on;
        env.moved();                      // the light field has to be rebuilt
        return L.on;
      }
      case "speaker": {
        const S = env.scene.speakers[m.id];
        if (!S) return false;
        S.playing = m.playing == null ? !S.playing : !!m.playing;
        return S.playing;
      }
      case "beep": {
        emitters = emitters.filter(e => e.owner !== m.id);
        if (m.on !== false) {
          const b = find(m.id);
          if (b) emitters.push({ owner: m.id, x: b.x, y: b.y });
        }
        env.setEmitters(emitters);
        return true;
      }

      /* The six questions, so a block can ask them over the bus exactly as a
         test asks them directly. */
      case "ray":     return env.raycast(m.from, m.angle, m.opts);
      case "light":   return env.lightAt(m.at, m.opts);
      case "sound":   return env.soundAt(m.at, m.opts);
      case "surface": return env.surfaceAt(m.at);
      case "medium":  return env.mediumAt();
      case "radio":   return env.radioBetween(m.a, m.b);

      case "snapshot": return snapshot();
      default: throw new Error("the room does not know how to " + m.cmd);
    }
  }

  /* One step of the world. Returns what went wrong, if anything, rather than
     throwing: one bad mouse message must not take the room down. */
  function tick() {
    const drained = bus.drain();
    for (const f of drained.failed) problems.push({ what: "failed", ...f });
    for (const u of drained.undelivered) problems.push({ what: "nobody took it", ...u });
    while (problems.length > 50) problems.shift();

    /* A held body does not move; the hand is holding it. */
    for (const b of bodies) if (b.held) { b.vl = 0; b.vr = 0; }

    env.setBodies(bodies);
    for (const e of emitters) { const b = find(e.owner); if (b) { e.x = b.x; e.y = b.y; } }
    env.setEmitters(emitters);

    advance(DT);
    return drained;
  }

  function snapshot() {
    return { t: clock.now, scene: sceneName, seed: seed, ...env.snapshot() };
  }

  const stop = bus.listen(ROOM, handle);
  open(opts.scene || DEFAULT_SCENE);

  return {
    bus, handle, tick, snapshot, open, add,
    env: () => env,
    bodies: () => bodies,
    problems: () => problems.slice(),
    close: stop
  };
}
