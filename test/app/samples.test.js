/* The regression.

   Not eighteen hex files - whole programs, run the way a child's program
   runs: in as TEXT, out through prepare(), compile(), the machine, the
   chassis and the world, for several seconds of gym time.

   That road is the point. `all-blocks.test.js` calls `api.bitbot.go()`
   straight off the object, which proves the block exists and does not
   throw, and never touches the source transform. The transform is where
   the worst bug so far lived: it turned `function wiggle()` into
   `function await wiggle()` and killed every program that defined a
   function of its own. No amount of calling blocks directly would have
   found that. Running the text does.

   What it asserts is deliberately loose about WHERE a robot ends up and
   strict about whether anything went wrong. matter.js is not
   bit-identical run to run, so pinning a millimetre would give a test
   that fails for the wrong reason every time the engine updates. "It ran
   clean, it did something, and it is still in the room" is the promise
   worth keeping. */

import { describe, it, expect, beforeEach } from "vitest";
import { createRoom, ROOM } from "../../src/app/room.js";
import { createBus } from "../../src/core/bus.js";
import { EXAMPLES, EVERY_BITBOT_BLOCK } from "../../src/app/examples.js";
import { clearLog, recent } from "../../src/core/log.js";

async function runFor(room, ms) {
  const steps = Math.round(ms / 5);
  for (let i = 0; i < steps; i++) {
    room.tick();
    await Promise.resolve();
    await Promise.resolve();
  }
}

const trouble = () => recent().filter(l => l.cls === "err").map(l => l.msg);
const unknown = () => recent().filter(l => /is not one the gym knows/.test(l.msg)).map(l => l.msg);

describe("the programs the gym ships with", () => {
  let bus, room;
  beforeEach(() => {
    clearLog();
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 3 });
  });

  for (const name of Object.keys(EXAMPLES)) {
    it('runs "' + name + '" for five seconds without a word of complaint', async () => {
      const id = bus.send(ROOM, { cmd: "add" });
      bus.send(ROOM, { cmd: "place", id, x: 1200, y: 1600 });
      bus.send(ROOM, { cmd: "load", id, code: EXAMPLES[name] });
      bus.send(ROOM, { cmd: "run", id });
      await runFor(room, 5000);

      expect(trouble()).toEqual([]);
      expect(unknown()).toEqual([]);
      expect(room.problems()).toEqual([]);

      /* still in the room, and still a real place */
      const b = room.snapshot().bodies.find(x => x.id === id);
      const size = room.snapshot().size;
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(size);
      expect(b.y).toBeLessThan(size);
    });
  }

  it("ends the wiggle dance with a tick on the screen, so the loop really finished",
     async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code: EXAMPLES["Wiggle dance"] });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 2000);
    const m = room.machine(id);
    expect(m.state()).toBe("end");
    /* the tick is 5 LEDs; the happy face it started on is not */
    expect(room.snapshot().bodies[0].screen.filter(v => v > 0).length).toBe(5);
  });

  it("actually drives somewhere when told to, rather than sitting still", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 500, y: 1500 });
    room.tick();
    const from = room.snapshot().bodies.find(b => b.id === id);
    bus.send(ROOM, { cmd: "load", id, code: EXAMPLES["Don't bump into things"] });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 3000);
    const to = room.snapshot().bodies.find(b => b.id === id);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThan(100);
  });
});

describe("every Bit:Bot block, as one program", () => {
  let bus, room;
  beforeEach(() => {
    clearLog();
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 4 });
  });

  it("runs start to finish with nothing unknown and nothing broken", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 1200, y: 1600 });
    bus.send(ROOM, { cmd: "load", id, code: EVERY_BITBOT_BLOCK });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 4000);

    expect(trouble()).toEqual([]);
    expect(unknown()).toEqual([]);
    expect(room.problems()).toEqual([]);
    /* it ran to the end rather than stopping on an error half way */
    expect(room.machine(id).state()).toBe("end");
    /* and the last thing it did was put a tick up, not the heart it opened with */
    expect(room.snapshot().bodies[0].screen.filter(v => v > 0).length).toBe(5);
  });

  it("names only blocks the gym really has", () => {
    /* The forgiving proxy answers for a block that is not there, so a
       typo in the sample above would pass unnoticed and the sample would
       stop being a test of anything. Check the names against the api. */
    const called = [...EVERY_BITBOT_BLOCK.matchAll(/\bbitbot\.([A-Za-z_$][\w$]*)\s*\(/g)]
      .map(m => m[1]);
    expect(called.length).toBeGreaterThan(40);
    const id = bus.send(ROOM, { cmd: "add" });
    room.tick();
    const api = room.machine(id).api;
    const missing = [...new Set(called)].filter(n => typeof api.bitbot[n] !== "function");
    expect(missing).toEqual([]);
  });
});
