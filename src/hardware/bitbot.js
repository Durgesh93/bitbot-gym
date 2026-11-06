/* The Bit:Bot XL chassis: where its senses are, and what they say.

   Two halves, and the line between them is the point of the file. The world
   tells us how much light falls on a spot; this tells us what number the LDR
   bolted there sends back. The world tells us there is a wall 1430 mm ahead;
   this tells us the sonar block says 143. Keep the laws in the fields and the
   quirks in the hardware, and the same robot works in a classroom and on a
   playground with nothing changed.

   Every measurement is off the real board. */

import { clamp } from "../core/util.js";
import { ADDONS, defaultFit, allows, isBuiltIn, clashesWith } from "./addons.js";

export const CHASSIS = {
  axle: 110,       // how far apart the wheels are
  radius: 62,      // the body, treated as a circle for bumping into things
  senFwd: 55,      // the light sensors sit this far forward
  senSide: 34,     // and this far out to each side
  senYaw: 0.44,    // each one faces about 25 degrees outwards
  senZ: 42,        // and this high off the floor, on top of the board
  senTilt: 0.80,   // looking UP and forward, 46 degrees off vertical
  lineFwd: 42,     // the line sensors are underneath, near the front
  lineSide: 18,
  sonarFwd: 62,    // the sonar looks straight ahead from the nose
  micZ: 45
};

/* What this robot asks the world for, every tick. Nothing else about the
   Bit:Bot can reach the room. */
export const PROBES = [
  { name: "lightL", kind: "light",   fwd: CHASSIS.senFwd,  side: -CHASSIS.senSide,
    z: CHASSIS.senZ, yaw: -CHASSIS.senYaw, tilt: CHASSIS.senTilt },
  { name: "lightR", kind: "light",   fwd: CHASSIS.senFwd,  side:  CHASSIS.senSide,
    z: CHASSIS.senZ, yaw:  CHASSIS.senYaw, tilt: CHASSIS.senTilt },
  { name: "lineL",  kind: "surface", fwd: CHASSIS.lineFwd, side: -CHASSIS.lineSide },
  { name: "lineR",  kind: "surface", fwd: CHASSIS.lineFwd, side:  CHASSIS.lineSide },
  { name: "sonar",  kind: "range",   fwd: CHASSIS.sonarFwd },
  { name: "mic",    kind: "sound",   fwd: 0, side: 0, z: CHASSIS.micZ }
];

/* A light-dependent resistor saturates: twice the light is nowhere near
   twice the number. HALF is the illuminance it reads about half way at, and
   it has to sit in the middle of what a lit classroom gives - otherwise
   every reading piles up at the top of the scale and the two eyes look
   identical, which is exactly the lesson that then will not work. */
const LDR_HALF = 3.0;
export function ldr(e, full) {
  const top = full == null ? 1023 : full;
  return clamp(Math.round(top * Math.pow(e / (e + LDR_HALF), 0.85)), 0, top);
}

/* The real sonar gives up at about 2 m, and when nothing comes back it
   returns 0 rather than something large. Children trip over this every year:
   "nothing there" and "touching my nose" are both small numbers, so the
   block to reach for is `if sonar > 0 and sonar < 20`. */
export const SONAR_MAX = 2000;
export function sonarCm(mm) {
  if (mm == null || !isFinite(mm) || mm > SONAR_MAX) return 0;
  return Math.round(mm / 10);
}

/* What the blocks return, from what the world said. `trim` is this robot's
   own small squint: no two LDRs ever match, and without it two eyes in a
   symmetrical spot read exactly the same and a light-chasing program sits
   there unable to choose. */
/* WHICH WAY ROUND THE LIGHT SENSORS READ.

   Ours give a bigger number for more light. Some boards are wired the
   other way and give a bigger number for darker, and a class whose robots
   disagree with the gym on this spends the lesson debugging the gym. One
   setting, measured once against the real robot. */
export const SENSOR = { lightUp: true };

function eye(e, t) {
  const v = clamp(ldr(e) + t, 0, 1023);
  return SENSOR.lightUp ? v : 1023 - v;
}

export function read(senses, trim) {
  const t = trim || 0;
  return {
    lightL: eye(senses.lightL, t),
    lightR: eye(senses.lightR, -t),
    lineL: senses.lineL && senses.lineL.dark ? 1 : 0,
    lineR: senses.lineR && senses.lineR.dark ? 1 : 0,
    sonar: sonarCm(senses.sonar),
    sound: clamp(Math.round(senses.mic || 0), 0, 255)
  };
}

/* ---------------------------------------------------------------------------
   The chassis as a thing with a state: what the motors have been told, how
   far the wheels have turned, what colour the lights are.

   The motor numbers are a percentage, and turning that into millimetres per
   second is the chassis's job, not the world's - because it is all about
   this robot: how flat its battery is, the fact that no two motors are
   twins, and the dead band below which a PWM value is not enough to break
   the gearbox free at all. That last one is why "go forward at 10%" does
   nothing on a real Bit:Bot, which children always try. */

export const MOTOR = {
  top: 450,        // mm/s at full tilt on a fresh battery
  dead: 15,        // below this percentage the robot does not move at all
  /* ZERO BY DEFAULT. Real motors are never twins and a real Bit:Bot does
     curve when told to go straight - but a gym that curves out of the box
     teaches the wrong lesson first. A child whose robot misses the line
     has to be able to believe their own code. The slider is still there,
     and turning it up to three or five is a good lesson of its own:
     "why does the real one not go straight?" */
  mismatch: 0      // % the right motor runs faster than the left; the slider adds it back
};

export function createChassis(spec) {
  const s = spec || {};
  const state = {
    model: s.model || "XL",
    lm: 0, rm: 0,                           // what the motors have been told, as a percentage
    brake: false,
    battery: s.battery == null ? 100 : s.battery,
    bias: { dir: null, amount: 0 },
    enc: { L: 0, R: 0 },                    // how far each wheel has rolled, in mm
    pixels: new Array(12).fill(null),
    bright: 40,

    /* WHAT IS BOLTED ON, and what each bolted-on board is showing.

       Kept here with the motors and the pixels because it is the same
       kind of fact: a property of this one robot that the blocks write
       to and the card reads. `fit` says which boards exist; `show`
       holds what they are displaying. A board that is not fitted keeps
       its picture anyway - unfit the matrix and refit it and your
       drawing is still there, exactly as unplugging a monitor does not
       wipe the computer. */
    fit: defaultFit(s.model || "XL"),
    show: freshShow()
  };

  /* What a wheel is being asked to do, in mm/s. */
  function commanded(percent, side) {
    const a = Math.abs(percent);
    if (a <= MOTOR.dead) return 0;
    const batt = 0.6 + 0.4 * state.battery / 100;        // a tired battery is a slower robot
    let v = MOTOR.top * batt * (a - MOTOR.dead) / (100 - MOTOR.dead);
    if (side === "R") v *= 1 + MOTOR.mismatch / 100;
    if (state.bias.dir === side) v *= 1 - state.bias.amount / 100;
    return percent < 0 ? -v : v;
  }

  return {
    /* Changing the model can make what is bolted on impossible - a
       Classic cannot carry the claw and the eyes at once, and a PRO has
       its own IR receiver so a second one has nowhere to go. Anything
       that no longer fits falls off, quietly, rather than staying on as
       a board that is fitted and does nothing. */
    model(v) {
      if (v != null && v !== state.model) {
        state.model = v;
        for (const id of Object.keys(state.fit)) {
          if (!allows(v, id) || isBuiltIn(v, id)) delete state.fit[id];
        }
        /* Walk the catalogue in its own order and keep the first of
           any clashing pair, so the eyes beat the claw rather than
           whichever happened to be fitted first. The order in
           addons.js is the order of importance. */
        const kept = {};
        for (const a of ADDONS) {
          if (!state.fit[a.id]) continue;
          if (clashesWith(v, a.id, kept).length) delete state.fit[a.id];
          else kept[a.id] = true;
        }
      }
      return state.model;
    },
    brake(v) { if (v != null) state.brake = !!v; return state.brake; },
    battery(v) { if (v != null) state.battery = clamp(v, 0, 100); return state.battery; },
    bias(dir, amount) { state.bias = { dir: dir, amount: amount }; },
    pixels: () => state.pixels,
    pixelBright(v) { if (v != null) state.bright = v; return state.bright; },

    /* null leaves a motor alone, which is what "set the left motor" means. */
    wheels(l, r) {
      if (l != null) state.lm = l;
      if (r != null) state.rm = r;
    },
    commandedSpeeds: () => ({ vl: commanded(state.lm, "L"), vr: commanded(state.rm, "R") }),
    willMove: percent => commanded(percent, "L") !== 0,

    /* "ease off to this many mm/s" - what the PRO's motor controller does on
       the last stretch of a counted move, so it does not sail past. */
    ease(mms) {
      const fastest = Math.max(Math.abs(commanded(state.lm, "L")), Math.abs(commanded(state.rm, "R")), 1);
      const f = mms / fastest;
      if (f < 1) { state.lm *= f; state.rm *= f; }
    },

    encoder: side => state.enc[side] || 0,
    resetEncoders(which) {
      if (which === "L") state.enc.L = 0;
      else if (which === "R") state.enc.R = 0;
      else { state.enc.L = 0; state.enc.R = 0; }
    },
    /* The wheels have turned: called once a tick with how far each went. */
    rolled(dl, dr) { state.enc.L += dl; state.enc.R += dr; },

    stop() { state.lm = 0; state.rm = 0; state.brake = true; },
    reset() {
      state.lm = 0; state.rm = 0; state.brake = false;
      state.bias = { dir: null, amount: 0 };
      state.enc = { L: 0, R: 0 };
      state.pixels = new Array(12).fill(null);
      state.bright = 40;
      state.battery = 100;
      /* the boards stay bolted on - Reset puts the program back to the
         start, it does not unscrew the hardware - but what they are
         showing is part of the program's doing, so that goes */
      state.show = freshShow();
    },
    state: () => ({ ...state, bias: { ...state.bias }, enc: { ...state.enc },
                    pixels: state.pixels.slice(),
                    fit: { ...state.fit }, show: copyShow(state.show) }),

    /* ---------------- what is bolted on ----------------

       `fit` with no second argument asks; with one, it screws the board
       on or takes it off. It refuses what this model cannot take and
       what would collide with something already fitted, and says which,
       so the menu can explain itself rather than just going dead. */
    fitted: (id) => !!state.fit[id] || isBuiltIn(state.model, id),
    fitting: () => ({ ...state.fit }),
    fit(id, on) {
      if (on == null) return !!state.fit[id];
      if (!on) { delete state.fit[id]; return { ok: true, fitted: false }; }
      if (isBuiltIn(state.model, id)) return { ok: false, why: "builtIn" };
      if (!allows(state.model, id)) return { ok: false, why: "model" };
      const bad = clashesWith(state.model, id, state.fit);
      if (bad.length) return { ok: false, why: "clash", with: bad };
      state.fit[id] = true;
      return { ok: true, fitted: true };
    },
    /* A whole set at once, for opening a saved project. */
    refit(fit) {
      state.fit = {};
      for (const id of Object.keys(fit || {})) if (fit[id]) this.fit(id, true);
      return { ...state.fit };
    },

    /* What the bolted-on boards are showing. The API writes through
       here so that one place knows the shapes. */
    show: () => state.show
  };
}

/* ---------------------------------------------------------------------
   The blank state of every add-on display. One function, called at
   birth and at Reset, so the two can never drift apart. */
function freshShow() {
  return {
    matrix: { px: new Array(25).fill(null), bright: 40, dirty: false },
    bitface: { eyeL: null, eyeR: null, nose: null, mouth: null, bright: 40 },
    oled: { lines: [], px: null, invert: false, zoom: false, dirty: false },
    talon: { open: 0 },
    servo: { P1: null, P2: null, deadband: 5 },
    ir: { code: 0, key: null, at: 0 }
  };
}

function copyShow(sh) {
  return {
    matrix: { ...sh.matrix, px: sh.matrix.px.slice() },
    bitface: { ...sh.bitface },
    oled: { ...sh.oled, lines: sh.oled.lines.slice(),
            px: sh.oled.px ? sh.oled.px.slice() : null },
    talon: { ...sh.talon },
    servo: { ...sh.servo,
             P1: sh.servo.P1 ? { ...sh.servo.P1 } : null,
             P2: sh.servo.P2 ? { ...sh.servo.P2 } : null },
    ir: { ...sh.ir }
  };
}
