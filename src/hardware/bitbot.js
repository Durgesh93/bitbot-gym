/* The Bit:Bot XL chassis: where its senses are, and what they say.

   Two halves, and the line between them is the point of the file. The world
   tells us how much light falls on a spot; this tells us what number the LDR
   bolted there sends back. The world tells us there is a wall 1430 mm ahead;
   this tells us the sonar block says 143. Keep the laws in the fields and the
   quirks in the hardware, and the same robot works in a classroom and on a
   playground with nothing changed.

   Every measurement is off the real board. */

import { clamp } from "../core/util.js";

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
export function read(senses, trim) {
  const t = trim || 0;
  return {
    lightL: clamp(ldr(senses.lightL) + t, 0, 1023),
    lightR: clamp(ldr(senses.lightR) - t, 0, 1023),
    lineL: senses.lineL && senses.lineL.dark ? 1 : 0,
    lineR: senses.lineR && senses.lineR.dark ? 1 : 0,
    sonar: sonarCm(senses.sonar),
    sound: clamp(Math.round(senses.mic || 0), 0, 255)
  };
}
