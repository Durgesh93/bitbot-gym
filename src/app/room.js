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

  /* WHO IS IN THE ROOM SURVIVES THE ROOM.

     Changing scene used to empty it: ten robots, ten names a class had
     chosen, ten transferred programs, gone because a teacher wanted to
     show the line track for two minutes. A room is the floor and the
     furniture; the children's robots are not part of it, and carrying
     them through is what every one of them expects.

     What crosses: the name, the program, the board's own state and the
     squint that makes its two eyes differ. What does not: where it was
     standing, because that was a place in a room that no longer exists -
     each one is set down at the new scene's start and walked out until it
     has elbow room. Anything actually RUNNING is stopped on the way
     through, with its code still loaded, so nothing is left driving across
     a floor it has never seen and nothing is left waiting on a pause that
     the restarted clock has moved out of reach. A robot that was only
     sitting there is left alone: telling a child their robot was
     "stopped" when it never ran is a small lie on a card they trust. */
  function open(name, keepRobots) {
    const data = SCENES[name];
    if (!data) throw new Error("there is no scene called " + name);

    const carried = [];
    if (keepRobots && env) {
      for (const [id, k] of kit) {
        const was = env.bodyOf(id);
        const doing = k.machine.state();
        if (doing === "run" || doing === "wait") k.machine.stop(true);
        carried.push({ id: id, kit: k,
                       r: was ? was.r : BOARD_RADIUS, z: was ? was.z : 95 });
      }
    }

    sceneName = name;
    env = createEnvironment(data);
    if (!carried.length) { kit.clear(); nextId = 1; }
    emitters = [];
    random.reseed(seed);
    resetClock();

    const spots = env.starts();
    carried.forEach((c, i) => {
      const at = clearOf(spots[i % spots.length] || spots[0], c.r);
      env.addBody({ id: c.id, x: at.x, y: at.y,
                    h: at.heading == null ? 0 : at.heading, r: c.r, z: c.z });
      /* the encoders count the difference between two ticks, and this one
         teleported; and "put it back at the start" means the new start */
      c.kit.pose = null;
      c.kit.start = { x: at.x, y: at.y, h: at.heading == null ? 0 : at.heading };
    });
    return env;
  }

  /* TWO KINDS OF THING GO IN THE ROOM, and the difference is the whole
     first lesson: a MICRO:BIT is the brain, and it can sit on the floor on
     its own doing screen, buttons, compass and radio; a BIT:BOT is that
     same brain in a body with wheels, eyes and a sonar. Plugging one into
     the other is a command, so a child can take the board off mid lesson
     and watch the `bitbot` blocks start refusing.

     They are named apart on purpose - Bit:Bot 1, 2, 3 and micro:bit A, B,
     C - because "pass me micro:bit C" has to pick out one thing in a room
     of ten, and a number next to a number does not. */
  const BOARD_RADIUS = 40;                       // a bare micro:bit, lying on the floor
  const READING_ROOM = 170;                      // enough space apart to read their labels

  /* Somewhere near `at` with nothing already standing in it.

     A ROW, THE WAY A TEACHER LINES THEM UP. It used to ring outwards from
     the start, eight places round each ring, which fills evenly in open
     space and knots up badly in the one place it is always used: a scene
     names a handful of start poses and the classroom names ONE, in a
     corner, so four robots ended up in a huddle with half the ring's
     places out through the wall. Marching across the room instead, and
     wrapping to the next row at the far side, puts them in a line - and a
     line is both what a class of ten actually looks like on the floor and
     the one arrangement whose labels cannot overlap.

     TWO PITCHES, TRIED IN ORDER, and the first is about reading rather
     than about bumping. Sixty millimetres apart is enough that two robots
     are not touching and nowhere near enough that you can read them: each
     wears its name above it and, with the sensor views on, three more
     lines below, and those labels are a fixed size however close the
     robots are. So the first pass asks for room to be READ in, and only
     when the room has genuinely run out does it fall back to room to
     stand in. */
  function clearOf(at, r) {
    const spot = { ...at };
    if (!at) return spot;
    const size = env.size;
    const place = (gap) => {
      const free = (x, y) => env.bodies().every(b =>
        Math.hypot(b.x - x, b.y - y) > b.r + r + gap);
      if (free(spot.x, spot.y)) return { ...at };
      const pitch = r * 2 + gap + 10;
      /* the margin is the LABELS' and not the body's: a robot hard against
         the wall has nowhere to draw its name */
      const edge = r + (gap > 60 ? 130 : 10);
      const inside = v => v > edge && v < size - edge;
      /* away from whichever wall the start pose is nearest */
      const stepX = spot.x < size / 2 ? pitch : -pitch;
      const stepY = spot.y < size / 2 ? pitch : -pitch;
      for (let row = 0; row < 10; row++) {
        const y = spot.y + stepY * row;
        if (!inside(y)) break;
        for (let col = 0; col < 14; col++) {
          const x = spot.x + stepX * col;
          if (!inside(x)) break;
          if ((row || col) && free(x, y)) return { ...at, x: x, y: y };
        }
      }
      return null;
    };
    return place(READING_ROOM) || place(60) || spot;
  }

  function nextName(kind) {
    const taken = n => [...kit.values()].some(k => k.machine.name() === n);
    if (kind === "bitbot") { let n = 1; while (taken("Bit:Bot " + n)) n++; return "Bit:Bot " + n; }
    let i = 0;
    while (taken("micro:bit " + String.fromCharCode(65 + i))) i++;
    return "micro:bit " + String.fromCharCode(65 + i);
  }

  /* Put a body down somewhere sensible: the scene's own start poses first,
     then anywhere clear. */
  function add(spec) {
    const s = spec || {};
    const starts = env.starts();
    const id = s.id == null ? nextId++ : s.id;
    const kind = s.kind === "microbit" ? "microbit" : "bitbot";
    const r = s.r == null ? (kind === "bitbot" ? bitbot.CHASSIS.radius : BOARD_RADIUS) : s.r;
    /* A scene names a handful of start spots and a class has ten boards, so
       after the fourth they land on each other - which looks like one robot
       and is two, and the child who presses Play watches the wrong one.
       Walk outwards from the spot until there is room. */
    const at = s.x != null ? s : clearOf(starts[kit.size % starts.length] || starts[0], r);
    const name = s.name || nextName(kind);
    const board = createBoard({ id: id, name: name });
    const chassis = createChassis();
    const machine = createMachine({
      id: id, name: name,
      board: board, chassis: chassis,
      now: () => clock.now,
      reads: () => { const got = senses.get(id); return got ? got.reads : {}; },
      temperature: () => env.mediumAt().airTemp,
      radio: wireFor(id)
    });
    machine.plug(kind === "bitbot");
    kit.set(id, {
      device: kind,
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
      r: r,
      z: s.z == null ? 95 : s.z
    });
  }

  /* The radio, as one shared air. A message reaches every other board on
     the same group and never the sender, and how strong it arrives is just
     how far away the sender was - which is the whole of the lesson where
     two children walk apart until the signal drops. */
  let lastFrom = new Map();          // who each board heard from most recently

  /* A short memory of what went over the air, for the PICTURE only.

     Radio is the one thing in the gym with no visible cause: two boards
     talk and the room shows nothing, so a child whose group number is
     wrong sees exactly what a child whose group is right sees - nothing -
     and has no way to tell which. A ring leaving the sender and a blink on
     everyone who heard it makes the group number visible, and makes the
     lesson where two children walk apart until the message stops arriving
     something you can watch rather than infer.

     It is kept here because the air is kept here, and it is an OBSERVATION
     of a send that already happened - nothing reads it back, and dropping
     it would change no number anywhere. */
  let aired = [];
  const AIR_MEMORY = 900;          // ms a ring stays worth drawing

  function wireFor(id) {
    return {
      send(kind, value, name) {
        const me = kit.get(id);
        if (!me) return;
        const heard = [];
        for (const [other, k] of kit) {
          if (other === id) continue;
          if (k.board.state().group !== me.board.state().group) continue;
          lastFrom.set(other, id);
          heard.push(other);
          k.machine.fire(kind === "number" ? "radioNumber"
                       : kind === "string" ? "radioString" : "radioValue", value, name);
        }
        /* Recorded even when nobody heard it: a ring that leaves a robot
           and reaches no one is the picture of a wrong group number. */
        aired.push({ from: id, to: heard, t: clock.now });
        if (aired.length > 24) aired = aired.slice(-24);
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
      /* The robots come with it. See `open`. */
      case "scene":   return open(m.name, true).name;
      case "add":     return add(m).id;
      case "remove":  kit.delete(m.id); return env.removeBody(m.id);

      /* A child picking a robot up with the mouse. Held means its wheels stop
         and its encoders do not jump, which is what the real thing does when
         you lift it off the floor. */
      /* ---- editing the room -------------------------------------------
         All posts, because they all come from a hand: they land on the next
         drain, between ticks, which is exactly where a hand lands. */
      case "thing":     return env.addThing(m.name, m.x, m.y, m.rot, m.centred);
      case "unthing":   return env.removeThingAt({ x: m.x, y: m.y });
      /* One named thing, rather than whatever happens to be under the
         pointer: a drag has to keep hold of the chair it started on. */
      case "moveThing": return env.moveThing(m.uid, m.x, m.y, m.centred);
      case "turnThing": return env.turnThing(m.uid, m.rot);
      case "copyThing": return env.copyThing(m.uid, m.dx, m.dy);
      case "dropThing": return env.removeThing(m.uid);
      case "addLamp":   return env.addLamp(m.x, m.y, m.kind).uid;
      case "addSpeaker": { const sp = env.addSpeaker(m.x, m.y); return sp ? sp.uid : null; }
      case "moveLamp":  return env.moveLamp(m.id, m.x, m.y);
      case "dropLamp":  return env.removeLamp(m.id);
      case "addMagnet": return env.addMagnet(m.x, m.y, m.rot).uid;
      case "moveMagnet": return env.moveMagnet(m.id, m.x, m.y);
      case "turnMagnet": return env.turnMagnet(m.id, m.rot);
      case "dropMagnet": return env.removeMagnet(m.id);
      /* Another board the same as this one, set down beside it and ready
         for its own program. The code is deliberately NOT copied: two
         robots running the same thing is a lesson, not a default. */
      case "copy": {
        const k = kit.get(m.id);
        const b = find(m.id);
        if (!k || !b) return null;
        return add({ kind: k.device, x: b.x + 150, y: b.y + 90, heading: b.h }).id;
      }
      case "furnish":   return env.furnish(m.count, m.seed).length;
      case "empty":     return env.clearThings();
      case "line":      return env.addLine(m.from, m.to, m.width);
      case "erase":     return env.eraseLineAt({ x: m.x, y: m.y }, m.r);
      case "clearFloor": return env.clearLines();
      case "catalogue": return env.catalogue();

      /* ---- robot settings ---------------------------------------------
         MEASURE YOUR OWN BIT:BOT ONCE AND SET THESE, and the gym stops
         lying to you. They are deliberately one set for every robot, not
         one per robot: they describe the hardware and the floor the class
         actually has, and ten robots that each drove differently would
         make every lesson unrepeatable. Battery is the exception the real
         world forces - it is per chassis - so setting it sets them all,
         which is what a trolley of robots charged together looks like. */
      case "tuning": return {
        top: bitbot.MOTOR.top, dead: bitbot.MOTOR.dead, mismatch: bitbot.MOTOR.mismatch,
        grip: env.grip(), lightUp: bitbot.SENSOR.lightUp,
        battery: kit.size ? [...kit.values()][0].chassis.battery() : 100
      };
      case "tune": {
        if (m.top != null) bitbot.MOTOR.top = m.top;
        if (m.dead != null) bitbot.MOTOR.dead = m.dead;
        if (m.mismatch != null) bitbot.MOTOR.mismatch = m.mismatch;
        if (m.grip != null) env.setGrip(m.grip);
        if (m.lightUp != null) bitbot.SENSOR.lightUp = !!m.lightUp;
        if (m.battery != null) for (const k of kit.values()) k.chassis.battery(m.battery);
        return handle({ cmd: "tuning" });
      }
      /* "what is under my finger?" - the one question the pointer has to
         ask the world rather than answer from the snapshot, because only
         the world knows a turned chair's real corners. */
      case "whatAt":    return env.thingAt({ x: m.x, y: m.y });

      /* "Put the robot back" - to where this scene says a robot starts. With
         no id it puts them all back, which is the one a teacher presses when
         ten of them have ended up in a corner. */
      /* PUT THEM ALL BACK, SIDE BY SIDE AND NOT ON TOP OF EACH OTHER. A
         scene names a handful of start spots - the classroom names ONE -
         so this sent every robot in the room to the same square
         millimetre, which looks like one robot and is ten. Each is walked
         out from the spot until it has room to be read, the same as when
         it was first put in. */
      case "home": {
        const spots = env.starts();
        const ids = m.id == null ? [...kit.keys()] : [m.id];
        ids.forEach((id, i) => {
          const aim = spots[i % spots.length] || { x: 400, y: 1600, heading: 0 };
          const b = env.bodyOf(id);
          /* out of the way first, or it finds itself standing there */
          if (b) env.placeBody(id, -9000, -9000, b.h);
          const at = clearOf(aim, b ? b.r : BOARD_RADIUS);
          env.placeBody(id, at.x, at.y, at.heading == null ? 0 : at.heading);
        });
        return ids.length;
      }

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
      /* Taking the board off is not just a flag: the thing in the room is a
         different size now, and the sonar of the robot beside it has to
         find that out. */
      case "plug": {
        const k = kit.get(m.id);
        if (!k) return false;
        const on = k.machine.plug(m.on);
        k.device = on ? "bitbot" : "microbit";
        env.resizeBody(m.id, on ? bitbot.CHASSIS.radius : BOARD_RADIUS);
        return on;
      }
      /* Names are the child's, not ours, and they have to stay unique or
         "look at micro:bit C" stops meaning anything. */
      case "rename": {
        const k = kit.get(m.id);
        if (!k) return null;
        const want = String(m.name || "").trim().slice(0, 18);
        if (!want) return k.machine.name();
        for (const [other, o] of kit) {
          if (other !== m.id && o.machine.name() === want) return k.machine.name();
        }
        return k.machine.rename(want);
      }
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
      if (!own) continue;
      /* A BARE MICRO:BIT HAS NO CHASSIS, so it has no chassis probes and no
         chassis readings - no eyes, no line sensors, no sonar. That is not
         a special case bolted on; it is the lesson. A board lying on the
         floor feels light, sound, its own buttons and the compass, and
         nothing else, and the card shows exactly that much. */
      const dev = DEVICES[own.device] || null;
      const raw = sample(env, b, dev ? dev.PROBES.concat(microbit.PROBES) : microbit.PROBES);
      senses.set(b.id, {
        senses: raw,
        /* the chassis half and the board half, in one object, because a
           child's card does not care which circuit board a number came off */
        reads: { ...(dev ? dev.read(raw, own.trim) : {}), ...own.board.read(raw, b) },
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
                         name: k.machine.name(), kind: k.device,
                         pixels: k.chassis.state().pixels, model: k.chassis.model() } : null;
      return got ? { ...b, senses: got.senses, reads: got.reads,
                     screen: got.screen, board: got.board, program: prog } : b;
    });
    /* filtered, never pruned in place: a snapshot is a photograph and must
       not change the thing it photographs */
    s.radio = aired.filter(a => clock.now - a.t < AIR_MEMORY);
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
