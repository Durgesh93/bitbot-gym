/* The self test, run headlessly.

   `checks/Gym Self Test.hex` is a real MakeCode hex, built the way a
   lesson's hex is built, and it is there to be opened in the gym and
   WATCHED - that is UI-CHECKS check 17, and it is the only way to find
   out whether the lights really go red or the robot really moves.

   This is the half of that a machine can do. It takes the source out of
   the hex - not off the .ts beside it, so the two cannot drift - and runs
   it the way a child's program runs, as text through compile() and the
   machine and the world. It is the one program in here that mixes the
   micro:bit's own blocks with the Bit:Bot's: `all-blocks.test.js` proves
   every Bit:Bot block exists, and `samples.test.js` runs whole programs,
   but neither had a micro:bit EVENT enum in it, which is how
   `TouchButtonEvent` managed to be missing from ENUMS without a single
   test going red. Every program with a logo block in it opened with a
   complaint across the log. */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoom, ROOM } from "../../src/app/room.js";
import { createBus } from "../../src/core/bus.js";
import { clearLog, recent } from "../../src/core/log.js";
import { readHex } from "../../src/app/hexfile.js";

const HEX = resolve(__dirname, "../../checks/Gym Self Test.hex");

async function runFor(room, ms) {
  const steps = Math.round(ms / 5);
  for (let i = 0; i < steps; i++) {
    room.tick();
    await Promise.resolve();
    await Promise.resolve();
  }
}

const said = () => recent().map(l => l.msg);
const trouble = () => recent().filter(l => l.cls === "err").map(l => l.msg);
const unknown = () => recent().filter(l => /is not one the gym knows/.test(l.msg)).map(l => l.msg);

describe("the self test hex", () => {
  let bus, room, ts;

  beforeEach(async () => {
    clearLog();
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 3 });
    const b = readFileSync(HEX);
    const out = await readHex(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
                              "Gym Self Test.hex");
    ts = out.ts;
  });

  it("is a hex that reopens as blocks, like a lesson's", async () => {
    const b = readFileSync(HEX);
    const out = await readHex(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
                              "Gym Self Test.hex");
    expect(out.name).toBe("Gym Self Test");
    /* no grey blocks: a child must be able to see every one of these */
    expect(out.files["main.blocks"]).toBeTruthy();
    expect(out.files["main.blocks"]).not.toMatch(/typescript_(statement|expression)/);
    /* and the drawers a new project has, so the toolbox looks the same */
    const deps = JSON.parse(out.files["pxt.json"]).dependencies;
    expect(Object.keys(deps).sort()).toEqual(["bitbot", "core", "microphone", "radio"]);
  });

  it("runs the whole sweep with nothing unknown and nothing broken", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 1200, y: 1600 });
    bus.send(ROOM, { cmd: "load", id, code: ts });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 40000);

    expect(unknown()).toEqual([]);
    expect(trouble()).toEqual([]);
    expect(room.problems()).toEqual([]);
  }, 30000);

  it("gets all the way to the end, touching every part on the way", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 1200, y: 1600 });
    bus.send(ROOM, { cmd: "load", id, code: ts });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 40000);

    const log = said().join("\n");
    /* each of these is a different part of the gym answering. The last
       one is the point: `show icon Yes` is the final line of the program,
       so if it is there the sweep did not stop half way. */
    for (const mark of [/show "GO"/, /show icon Heart/, /sound: C/,
                        /lights red/, /lights green/,
                        /forward at 40%/, /turn right at 40%/,
                        /radio group 1/, /radio sent 7/, /show icon Yes/])
      expect(log, "nothing in the log matched " + mark).toMatch(mark);

    /* six numbers between the wheels and the radio: sonar, the Bit:Bot's
       own light sensor, a line sensor, the micro:bit light sensor, the
       microphone and the compass */
    const numbers = log.split("\n").filter(l => /^show number /.test(l));
    expect(numbers.length).toBeGreaterThanOrEqual(6);
  }, 30000);

  it("moved the robot, rather than only talking about it", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 1200, y: 1600 });
    const before = room.bodies().find(b => b.id === id);
    const from = { x: before.x, y: before.y, h: before.h };
    bus.send(ROOM, { cmd: "load", id, code: ts });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 40000);

    const after = room.bodies().find(b => b.id === id);
    /* it drives forward for a second and then spins right for a second,
       so both of these have to have changed - a robot that only turned,
       or only talked, fails here. The heading is compared the short way
       round, because an angle that has gone past pi comes back as a
       negative number and a plain subtraction would call that a huge
       turn. */
    const turned = Math.abs(Math.atan2(Math.sin(after.h - from.h),
                                       Math.cos(after.h - from.h)));
    expect(Math.hypot(after.x - from.x, after.y - from.y),
           "it never moved").toBeGreaterThan(50);
    expect(turned, "it never turned").toBeGreaterThan(0.3);
  }, 30000);
});
