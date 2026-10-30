"use strict";

/* ========================================================================
   1. The world. Everything is in millimetres; the room is 2 m square.
   ======================================================================== */
const ROOM = 2000;
const FLOOR_N = 500;                 // floor bitmap resolution for the drawn line
const MM_PER_FLOORPX = ROOM / FLOOR_N;

const BOT = {
  axle: 110,       // distance between the wheels
  radius: 62,      // body, treated as a circle for bumping into things
  senFwd: 55,      // light sensors sit this far forward
  senSide: 34,     // and this far out to each side
  senAngle: 0.44,  // each one faces about 25 degrees outwards
  senZ: 42,        // and sits this high off the floor, on top of the board
  senTilt: 0.80,   // it looks UP and forward, 46 degrees off vertical
  lineFwd: 42,     // line sensors underneath, near the front
  lineSide: 18,
  sonarFwd: 62
};

const MAX_MICROBITS = 10, MAX_BOTS = 6;
const COLOURS = ["#5bc0eb", "#f2b134", "#46c37b", "#e8575a", "#c77dff", "#2dd4bf",
                 "#ff8fab", "#9bc53d", "#fca311", "#8ecae6"];

/* A micro:bit is the brain: it holds the program, the screen, the buttons and
   the radio. A Bit:Bot is the body: wheels, lights, line and light sensors and
   the sonar. Plug one into the other and the program can drive. Unplugged, a
   micro:bit is just a board in a child's hand - which is all the radio lessons
   ever needed. */
let nextId = 1;

function makeBot(name, x, y) {
  return {
    name: name, x: x, y: y, h: -Math.PI / 2,
    lm: 0, rm: 0, vl: 0, vr: 0, brake: false,
    enc: { l: 0, r: 0 }, bias: { dir: null, amount: 0 },
    model: "XL", batt: 100,
    afwd: 0, aside: 0, pv: 0, warm: 0,      // what the accelerometer and the thermometer feel
    eyeTrim: Math.random() < 0.5 ? -1 : 1,  // this robot's own pair of eyes, one a count off the other
    pixels: new Array(12).fill(null), pixelBright: 40,
    trail: []
  };
}

/* A device is one thing you can hold: either a Bit:Bot, which arrives with a
   micro:bit already on it and wheels underneath, or a bare micro:bit in a
   child's hand. Both carry a program; only one of them can drive. */
function makeDevice(kind, name, colour, x, y) {
  const d = {
    id: nextId++, kind: kind, name: name, colour: colour,
    x: x, y: y, h: -Math.PI / 2,
    code: "", project: null,
    screen: new Array(25).fill(0),
    radioGroup: 0,
    timers: [], token: 0, foreverQueue: [], handlers: {}, noted: new Set(),
    held: { A: false, B: false, logo: false }, beeping: 0,   // buttons under a finger, buzzer sounding
    bot: null
  };
  if (kind === "bitbot") d.bot = makeBot(name, x, y);
  return d;
}

const world = {
  mbits: [], bots: [], sel: 0,
  lamps: [],
  show: { light: false, magnetic: false, sonar: false },
  boxes: [],
  showTrail: true
};

const mbit = () => world.mbits[world.sel] || world.mbits[0];
const botOf = m => (m && m.bot) || null;
const hostOf = b => world.mbits.find(m => m.bot === b) || null;
// where a device actually is: on its own wheels, or wherever it was put down
const placeOf = m => m.bot || m;
// the bodies, kept in step with the devices that own them
function syncBots() { world.bots = world.mbits.map(m => m.bot).filter(Boolean); }

const cfg = { top: 450, dead: 15, torch: 1200, invert: false };

/* floor bitmap for the black line */
const floor = document.createElement("canvas");
floor.width = floor.height = FLOOR_N;
const fctx = floor.getContext("2d", { willReadFrequently: true });
let floorData = null;
function refreshFloor() { floorData = fctx.getImageData(0, 0, FLOOR_N, FLOOR_N).data; }
refreshFloor();

function isDark(x, y) {
  if (!floorData) return false;
  const px = Math.floor(x / MM_PER_FLOORPX), py = Math.floor(y / MM_PER_FLOORPX);
  if (px < 0 || py < 0 || px >= FLOOR_N || py >= FLOOR_N) return false;
  return floorData[(py * FLOOR_N + px) * 4 + 3] > 120;
}

