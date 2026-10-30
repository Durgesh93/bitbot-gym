/* The micro:bit V2 board: the brain.

   It holds the program, the screen, the buttons, the compass and the radio.
   A Bit:Bot is the body underneath it - wheels, FireLeds, line and light
   sensors, the sonar. Plug one into the other and the program can drive;
   leave the board in a child's hand and the `bitbot` blocks politely refuse,
   which is the state every radio lesson is actually in.

   Same split as everywhere else: the world says how much light falls on the
   board and how warm the air is, and this says what `light level` and
   `temperature` return. */

import { clamp } from "../core/util.js";
import { createScreen } from "./screen.js";

/* The board's own senses, as probes. It has far fewer than the chassis: it
   is a square of circuit board lying flat, so its light sensor looks
   straight up and its microphone hears from everywhere. */
export const PROBES = [
  { name: "screenLight", kind: "light", fwd: 0, side: 0, z: 42 },   // normal omitted: straight up
  { name: "mic", kind: "sound", fwd: 0, side: 0, z: 42 }
];

/* The LEDs double as a light meter, and `light level` is 0 to 255 - a
   different scale from the Bit:Bot's 0 to 1023, which catches children out
   when they move a program from one to the other. Same curve, though. */
const LDR_HALF = 3.0;
export function lightLevel(e) {
  return clamp(Math.round(255 * Math.pow(e / (e + LDR_HALF), 0.85)), 0, 255);
}

/* The Earth's field over southern Norway: about 50 uT, but pointing steeply
   DOWN, some 72 degrees below horizontal. Only the small horizontal part,
   around 15 uT, is any use for finding north - which is the honest reason a
   compass is so easily upset, and worth saying to a class that has just
   watched one swing about. */
export const FIELD = { total: 50.5, inclination: 72, declination: 3 };

/* Heading in degrees, 0 = north, clockwise. On the canvas north is up, so a
   robot facing up the screen has heading -90 degrees in canvas angles. */
export function compassHeading(h) {
  const deg = (h * 180 / Math.PI + 90 - FIELD.declination) % 360;
  return Math.round((deg + 360) % 360);
}

/* What the three axes read, in microtesla, for a board lying flat. */
export function magneticForce(h, axis) {
  const incl = FIELD.inclination * Math.PI / 180;
  const H = FIELD.total * Math.cos(incl);          // horizontal, about 15 uT
  const Z = FIELD.total * Math.sin(incl);          // vertical, about 48 uT, downwards
  const t = compassHeading(h) * Math.PI / 180;
  if (axis === "x") return Math.round(-H * Math.sin(t) * 1000) / 1000;
  if (axis === "y") return Math.round(H * Math.cos(t) * 1000) / 1000;
  if (axis === "z") return Math.round(Z * 1000) / 1000;
  return Math.round(FIELD.total * 1000) / 1000;
}

/* One board. Everything a program can see or change about it lives in here,
   and nothing in here knows the world exists. */
export function createBoard(spec) {
  const s = spec || {};
  const screen = createScreen();

  const state = {
    id: s.id,
    name: s.name || "micro:bit",
    group: 0,                       // radio group; a board only hears its own
    power: 7,                       // radio transmit power, 0 to 7
    buttons: { A: false, B: false, logo: false },
    gestures: [],                   // shakes and tilts waiting to be noticed
    beeping: false,
    bright: 255,
    sound: 0,                       // what the microphone last heard
    light: 0,                       // what the screen last measured
    plugged: s.plugged == null ? true : !!s.plugged   // is it on a Bit:Bot
  };

  return {
    screen,
    state: () => ({ ...state, buttons: { ...state.buttons }, screen: screen.cells() }),

    /* A finger on a button. Held, rather than clicked, because the board
       has `is A pressed` as well as `on A pressed` and the two disagree if
       a press is only ever an instant. */
    press(which, down) {
      if (!(which in state.buttons)) return false;
      state.buttons[which] = !!down;
      return true;
    },
    pressed: which => !!state.buttons[which],

    /* A shake or a tilt is noticed once and then gone, which is what makes
       `on shake` fire once rather than for as long as the hand moves. */
    gesture(name) { state.gestures.push(name); },
    takeGestures() { const g = state.gestures; state.gestures = []; return g; },

    group(n) { if (n != null) state.group = clamp(Math.round(n), 0, 255); return state.group; },
    power(n) { if (n != null) state.power = clamp(Math.round(n), 0, 7); return state.power; },
    beep(on) { state.beeping = !!on; return state.beeping; },
    isBeeping: () => state.beeping,
    plugged: () => state.plugged,
    plug(on) { state.plugged = !!on; return state.plugged; },

    /* The probes came back; turn them into what the blocks return. The pose
       is passed separately because a heading is not something a probe can
       sample - the board knows which way it is facing without looking. */
    read(senses, body) {
      state.light = lightLevel(senses.screenLight || 0);
      state.sound = clamp(Math.round(senses.mic || 0), 0, 255);
      const h = body ? body.h || 0 : 0;
      return {
        light: state.light,
        sound: state.sound,
        compass: compassHeading(h),
        magnet: magneticForce(h),
        buttonA: state.buttons.A ? 1 : 0,
        buttonB: state.buttons.B ? 1 : 0,
        logo: state.buttons.logo ? 1 : 0
      };
    }
  };
}
