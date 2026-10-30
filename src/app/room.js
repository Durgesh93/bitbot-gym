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
import * as microbit from "../hardware/microbit.js";
import { createBoard } from "../hardware/microbit.js";
import { createChassis } from "../hardware/bitbot.js";
import { createMachine } from "./machine.js";

/* Every kind of chassis that can be put in the room: where its senses are,
   and how it turns what the world says into the number a block returns.
   Adding a second chassis is one more line here.

   Every robot also carries a micro:bit, because that is how the real thing
   works: the board is the brain and the chassis is the body. The board has
   its own two probes - the screen doubles as a light meter and the V2 has a
   microphone - so a robot's probe list is the two lists joined. */
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
    const board = createBoard({ id: id, name: s.name || ("micro:bit " + id) });
    const chassis = createChassis();
    const machine = createMachine({
      id: id, name: s.name || ("micro:bit " + id),
      board: board, chassis: chassis,
      now: () => clock.now,
      reads: () => { const got = senses.get(id); return got ? got.reads : {}; },
      temperature: () => env.mediumAt().airTemp,
      radio: wireFor(id)
    });
    kit.set(id, {
      device: s.device || "bitbot",
      /* this robot's own small squint, fixed for its whole life, so its two
         eyes never read exactly the same and a light-chaser can choose */
      trim: s.trim == null ? random.int(-6, 6) : s.trim,
      board: board,
      chassis: chassis,
      machine: machine,
      pose: null                 // where it was last tick, for the wheel encoders
    });
    return env.addBody({
      id: id,
      x: at.x, y: at.y, h: at.heading == null ? 0 : at.heading,
      r: s.r == null ? bitbot.CHASSIS.radius : s.r,
      z: s.z == null ? 95 : s.z
    });
  }

  /* The radio, as one shared air. A message reaches every other board on
     the same group and never the sender, and how strong it arrives is just
     how far away the sender was - which is the whole of the lesson where
     two children walk apart until the signal drops. */
  let lastFrom = new Map();          // who each board heard from most recently
  function wireFor(id) {
    return {
      send(kind, value, name) {
        const me = kit.get(id);
        if (!me) return;
        for (const [other, k] of kit) {
          if (other === id) continue;
          if (k.board.state().group !== me.board.state().group) continue;
          lastFrom.set(other, id);
          k.machine.fire(kind === "number" ? "radioNumber"
                       : kind === "string" ? "radioString" : "radioValue", value, name);
        }
      },
      strength() {
        const from = lastFrom.get(id);
        if (from == null) return -128;
        const a = env.bodyOf(id), b = env.bodyOf(from);
        if (!a || !b) return -128;
        return env.radioBetween(a, b).strength;
      }
    };
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
      /* The motors, as a percentage, exactly as the blocks set them. The
         chassis turns that into millimetres per second on the next tick. */
      case "drive": { const k = kit.get(m.id); if (!k) return false;
                      k.chassis.wheels(m.left, m.right); return true; }

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
      /* A finger on a button, a hand shaking the board, a child picking a
         radio group. All posts: they come from a human, so they land
         between ticks like every other human thing. */
      case "press": {
        const k = kit.get(m.id);
        if (!k) return false;
        k.board.press(m.button, m.down);
        /* `on button A pressed` fires on the way DOWN, like the real one */
        if (m.down) {
          k.machine.fire(m.button);
          if (m.button === "A" && k.board.pressed("B")) k.machine.fire("AB");
          if (m.button === "B" && k.board.pressed("A")) k.machine.fire("AB");
        }
        return true;
      }
      case "gesture": {
        const k = kit.get(m.id);
        if (!k) return false;
        k.board.gesture(m.name);
        k.machine.fire(m.name);
        return true;
      }
      case "group":   { const k = kit.get(m.id); return k ? k.board.group(m.group) : false; }
      case "screen":  { const k = kit.get(m.id); if (!k) return false;
                        if (m.text != null) k.board.screen.leds(m.text);
                        else if (m.icon) k.board.screen.icon(m.icon);
                        else if (m.ch != null) k.board.screen.glyph(m.ch);
                        else k.board.screen.clear();
                        return true; }
      case "board":   { const k = kit.get(m.id); return k ? k.board : null; }

      /* A program: loaded, started, stopped, put back. One robot at a
         time, because each card has its own Play. */
      case "load":  { const k = kit.get(m.id); if (!k) return false; k.machine.load(m.code); return true; }
      case "run":   { const k = kit.get(m.id); if (!k) return false; k.machine.run(); return true; }
      case "stop":  { const k = kit.get(m.id); if (!k) return false; k.machine.stop(); return true; }
      case "reset": { const k = kit.get(m.id); if (!k) return false;
                      k.machine.reset();
                      if (k.start) env.placeBody(m.id, k.start.x, k.start.y, k.start.h);
                      return true; }
      case "plug":  { const k = kit.get(m.id); return k ? k.machine.plug(m.on) : false; }
      case "stopAll": { for (const k of kit.values()) k.machine.stop(true); return true; }

      /* A hand holding the buzzer on, as opposed to a program doing it.
         Both end up as the same sound source. */
      case "beep": {
        const k = kit.get(m.id);
        if (!k) return false;
        k.buzzing = m.on !== false;
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

    /* 2. Every robot's motors, as they stand, become wheel speeds. The
       chassis works out the millimetres per second - a flat battery, the
       dead band, the fact that no two motors are twins - and matter.js is
       told nothing but the two numbers. */
    for (const [id, k] of kit) {
      const w = k.chassis.commandedSpeeds();
      env.drive(id, w.vl, w.vr, bitbot.CHASSIS.axle);
      const was = env.bodyOf(id);
      k.pose = was ? { x: was.x, y: was.y, h: was.h } : null;
      if (!k.start && was) k.start = { x: was.x, y: was.y, h: was.h };
    }

    /* 4. Everything moves, once, and the fields are marked stale once. A
       held body is static in the engine, so the hand owns it completely. */
    env.step(DT);

    /* The encoders count what actually happened, not what was asked for.
       That gap IS the lesson: a robot stuck against a table leg has motors
       running and wheels that are not turning, and "go 20 cm" never
       finishes. Two wheels is all the robot knows about its own heading. */
    for (const [id, k] of kit) {
      const now = env.bodyOf(id);
      if (!now || !k.pose) continue;
      const dx = now.x - k.pose.x, dy = now.y - k.pose.y;
      let dh = now.h - k.pose.h;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const along = dx * Math.cos(k.pose.h) + dy * Math.sin(k.pose.h);
      const half = dh * bitbot.CHASSIS.axle / 2;
      k.chassis.rolled(along + half, along - half);
    }

    /* A beeping board is a sound source its neighbours can hear. */
    emitters = [];
    for (const [id, k] of kit) {
      if (!k.buzzing && !k.machine.isBeeping()) continue;
      const b = env.bodyOf(id);
      if (b) emitters.push({ owner: id, x: b.x, y: b.y });
    }
    env.setEmitters(emitters);

    /* 5. Now, and only now, the sensors. The world has settled, so every
       probe on every robot is reading the same instant - which is what stops
       one eye seeing a lamp the other one missed. */
    senses.clear();
    for (const b of env.bodies()) {
      const own = kit.get(b.id);
      const dev = own && DEVICES[own.device];
      if (!dev) continue;
      const raw = sample(env, b, dev.PROBES.concat(microbit.PROBES));
      senses.set(b.id, {
        senses: raw,
        /* the chassis half and the board half, in one object, because a
           child's card does not care which circuit board a number came off */
        reads: { ...dev.read(raw, own.trim), ...own.board.read(raw, b) },
        screen: own.board.screen.cells(),
        board: own.board.state()
      });
    }

    advance(DT);

    /* 6. The clock has moved, so every program that was waiting for it can
       carry on. They run as microtasks, which means after this tick and
       before the next - never half way through one. */
    for (const k of kit.values()) k.machine.release();

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
      const k = kit.get(b.id);
      const prog = k ? { state: k.machine.state(), stopwatch: k.machine.stopwatch(),
                         plugged: k.machine.plugged(), armed: k.machine.armed().length,
                         pixels: k.chassis.state().pixels, model: k.chassis.model() } : null;
      return got ? { ...b, senses: got.senses, reads: got.reads,
                     screen: got.screen, board: got.board, program: prog } : b;
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
    machine: (id) => { const k = kit.get(id); return k ? k.machine : null; },
    machines: () => [...kit.values()].map(k => k.machine),
    problems: () => problems.slice(),
    close: stop
  };
}
