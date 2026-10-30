/* The whole block API a child's program sees, in one object.

   Two things happen here that are worth knowing about.

   Every namespace is wrapped in a forgiving proxy. A block the gym has
   never been taught says so in the log and returns 0, rather than throwing
   `bitbot.oledZOOM is not a function` and killing a program half way down.
   A child who pasted something from the internet gets a note and a robot
   that still drives, which is the right outcome in a classroom.

   And `bitbot.*` refuses politely when the board is not plugged into a
   chassis. That is not an edge case: it is the state every radio lesson is
   in, where a micro:bit sits in a child's hand with no robot under it. */

import { createMicrobitApi } from "./microbit.js";
import { createBitbotApi } from "./bitbot.js";
import { ENUMS } from "./enums.js";

export { ENUMS };

function forgiving(name, obj, ctx, needsChassis) {
  return new Proxy(obj, {
    get(target, key) {
      if (typeof key !== "string") return target[key];
      const fn = key in target ? target[key] : null;
      return function () {
        if (needsChassis && !ctx.plugged()) {
          ctx.sayOnce("nobot", ctx.name() + " is not plugged into a Bit:Bot, so " +
                                name + "." + key + " does nothing");
          return 0;
        }
        if (!fn) { ctx.sayOnce("todo:" + name + "." + key,
                               "note: " + name + "." + key + " is not simulated yet"); return 0; }
        return fn.apply(target, arguments);
      };
    }
  });
}

export function createApi(ctx) {
  const mb = createMicrobitApi(ctx);
  const bb = createBitbotApi(ctx);
  return {
    basic: forgiving("basic", mb.basic, ctx),
    input: forgiving("input", mb.input, ctx),
    led: forgiving("led", mb.led, ctx),
    music: forgiving("music", mb.music, ctx),
    radio: forgiving("radio", mb.radio, ctx),
    control: forgiving("control", mb.control, ctx),
    pins: forgiving("pins", mb.pins, ctx),
    loops: forgiving("loops", mb.loops, ctx),
    game: forgiving("game", mb.game, ctx),
    serial: forgiving("serial", mb.serial, ctx),
    bitbot: forgiving("bitbot", bb, ctx, true),
    images: mb.images,
    randint: mb.randint
  };
}

/* Every block name the gym answers to, for the coverage test. The proxy
   means an unknown name never throws, so without this list a block could
   quietly go missing and nothing would notice. */
export function blockNames() {
  const noop = () => {};
  const ctx = stubContext();
  const api = { ...createMicrobitApi(ctx) };
  const bb = createBitbotApi(ctx);
  const out = {};
  for (const ns of ["basic", "input", "led", "music", "radio", "control",
                    "pins", "loops", "game", "serial"]) {
    out[ns] = Object.keys(api[ns]).sort();
  }
  out.bitbot = Object.keys(bb).sort();
  return out;
}

/* A context that answers everything and does nothing, so the names can be
   listed without a world, a clock or a robot. */
export function stubContext() {
  const screen = {
    cells: () => new Array(25).fill(0), clear() {}, plot() {}, unplot() {}, toggle() {},
    point: () => false, brightnessAt: () => 0, pattern() {}, glyph() {}, icon() {},
    leds() {}, bar() {}
  };
  const px = new Array(12).fill(null);
  return {
    board: { screen, pressed: () => false, group: () => 0, power: () => 0 },
    chassis: {
      model: () => "XL", wheels() {}, brake() {}, bias() {}, willMove: () => true,
      encoder: () => 0, resetEncoders() {}, ease() {}, pixels: () => px, pixelBright() {}
    },
    reads: () => ({ lightL: 0, lightR: 0, lineL: 0, lineR: 0, sonar: 0, sound: 0,
                    light: 0, compass: 0, magnet: 0, buttonA: 0, buttonB: 0, logo: 0 }),
    wait: async () => {}, now: () => 0,
    say() {}, sayOnce() {},
    radio: { send() {}, strength: () => -60 },
    random: { int: () => 0, next: () => 0 },
    axle: 110,
    forever() {}, on() {}, cancel() {},
    temperature: () => 21, acceleration: () => 0, rotation: () => 0,
    brightness: () => 255, tempo: () => 120, volume: () => 127,
    beep() {}, isBeeping: () => false,
    score: () => 0, life: () => 3, over: () => false,
    plugged: () => true, name: () => "micro:bit"
  };
}
