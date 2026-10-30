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
     5. devices sample their probes from the settled world
     6. hand out one snapshot

   Steps in brackets arrive with hardware/. The order is already fixed, so
   they drop in without moving anything else. */

import { bus as sharedBus } from "../core/bus.js";
import { random } from "../core/random.js";
import { DT, clock, resetClock, advance } from "../core/time.js";
import { createEnvironment } from "../world/environment.js";
import { sample } from "../world/senses.js";
import { SCENES, DEFAULT_SCENE } from "../world/scenes/index.js";
import * as bitbot from "../hardware/bitbot.js";

/* Every kind of thing that can be put in the room: where its senses are, and
   how it turns what the world says into the number a block returns. Adding a
   second chassis is one more line here. */
const DEVICES = { bitbot: bitbot };

export const ROOM = "world";

export function createRoom(options) {
  const opts = options || {};
  const bus = opts.bus || sharedBus;
  const seed = opts.seed == null ? 20261030 : opts.seed;

  let sceneName = null;
  let env = null;
  let emitters = [];
  let nextId = 1;
  /* What the room knows about a robot that matter.js has no use for: which
     chassis it is and its own small squint. Where it IS lives in the engine,
     and asking two places would be how they start disagreeing. */
  const kit = new Map();
  const problems = [];      // posts that went nowhere or blew up, for the log

  function open(name) {
    const data = SCENES[name];
    if (!data) throw new Error("there is no scene called " + name);
    sceneName = name;
    env = createEnvironment(data);
    kit.clear();
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
    const at = s.x != null ? s : (starts[kit.size % starts.length] || starts[0]);
    const id = s.id == null ? nextId++ : s.id;
    kit.set(id, {
      device: s.device || "bitbot",
      /* this robot's own small squint, fixed for its whole life, so its two
         eyes never read exactly the same and a light-chaser can choose */
      trim: s.trim == null ? random.int(-6, 6) : s.trim
    });
    return env.addBody({
      id: id,
      x: at.x, y: at.y, h: at.heading == null ? 0 : at.heading,
      r: s.r == null ? bitbot.CHASSIS.radius : s.r,
      z: s.z == null ? 95 : s.z
    });
  }

  const find = id => env.bodyOf(id);
  const bodies = () => env.bodies();

  /* Every message the room takes. A sensor question is a `send` and comes
     back with a number; everything a human does is a `post` and lands on the
     next drain. */
  function handle(msg) {
    const m = msg || {};
    switch (m.cmd) {
      case "scene":   return open(m.name).name;
      case "add":     return add(m).id;
      case "remove":  kit.delete(m.id); return env.removeBody(m.id);

      /* A child picking a robot up with the mouse. Held means its wheels stop
         and its encoders do not jump, which is what the real thing does when
         you lift it off the floor. */
      case "hold":  return env.holdBody(m.id, true);
      case "drop":  return env.holdBody(m.id, false);
      case "place": return env.placeBody(m.id, m.x, m.y, m.heading);
      case "drive": return env.drive(m.id, m.left, m.right, bitbot.CHASSIS.axle);

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

    /* 4. Everything moves, once, and the fields are marked stale once. A
       held body is static in the engine, so the hand owns it completely. */
    env.step(DT);

    for (const e of emitters) { const b = find(e.owner); if (b) { e.x = b.x; e.y = b.y; } }
    env.setEmitters(emitters);

    /* 5. Now, and only now, the sensors. The world has settled, so every
       probe on every robot is reading the same instant - which is what stops
       one eye seeing a lamp the other one missed. */
    senses.clear();
    for (const b of env.bodies()) {
      const own = kit.get(b.id);
      const dev = own && DEVICES[own.device];
      if (!dev) continue;
      const raw = sample(env, b, dev.PROBES);
      senses.set(b.id, { senses: raw, reads: dev.read(raw, own.trim) });
    }

    advance(DT);
    return drained;
  }

  /* What each body's probes last came back with: the physical quantities the
     world handed over, and the numbers its blocks would return. Keyed by id,
     emptied and refilled every tick. */
  const senses = new Map();

  /* One object a tick, and the card for a robot is drawn from nothing else.
     That is why the card does not care that the robot moved: it moved, so its
     probes landed somewhere new, so the readings changed, so the card is
     different. Position is never read by the card at all. */
  function snapshot() {
    const s = env.snapshot();
    s.bodies = s.bodies.map(b => {
      const got = senses.get(b.id);
      return got ? { ...b, senses: got.senses, reads: got.reads } : b;
    });
    return { t: clock.now, scene: sceneName, seed: seed, ...s };
  }

  /* The room's light, as a square of samples for the renderer. Twelve
     thousand of them, against a 16 ms frame, so it is worked out again only
     when something that makes or blocks light has actually moved. */
  let cached = null;
  function lightMap(n) {
    const mark = env.generation() + ":" + n + ":" + sceneName;
    if (!cached || cached.mark !== mark) cached = { mark: mark, map: env.lightMap(n), n: n };
    return cached;
  }

  const stop = bus.listen(ROOM, handle);
  open(opts.scene || DEFAULT_SCENE);

  return {
    bus, handle, tick, snapshot, lightMap, open, add,
    env: () => env,
    bodies: bodies,
    kit: (id) => kit.get(id) || null,
    problems: () => problems.slice(),
    close: stop
  };
}
