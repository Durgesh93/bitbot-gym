import { describe, it, expect, beforeEach } from "vitest";
import { createBus } from "../../src/core/bus.js";
import { createRoom, ROOM } from "../../src/app/room.js";
import { normalFrom } from "../../src/world/fields/light.js";

const eye = f => ({ z: 42, normal: normalFrom(f, 0.80) });

let bus, room;
beforeEach(() => { bus = createBus(); room = createRoom({ bus, scene: "classroom" }); });

describe("the room", () => {
  it("opens a scene and says which", () => {
    expect(room.snapshot().scene).toBe("classroom");
    expect(room.env().name).toBe("Classroom");
  });

  it("refuses a scene that does not exist, by name", () => {
    expect(() => room.open("mars")).toThrow(/no scene called mars/);
  });

  it("refuses a message it does not understand, rather than ignoring it", () => {
    expect(() => bus.send(ROOM, { cmd: "teleport" })).toThrow(/does not know how to teleport/);
  });

  it("puts a robot on the scene's own start pose", () => {
    const id = bus.send(ROOM, { cmd: "add" });
    const start = room.env().starts()[0];
    expect(room.bodies()[0]).toMatchObject({ id, x: start.x, y: start.y });
  });

  it("answers all six questions over the bus", () => {
    const at = { x: 1000, y: 1000 };
    expect(typeof bus.send(ROOM, { cmd: "ray", from: at, angle: 0 })).toBe("number");
    expect(typeof bus.send(ROOM, { cmd: "light", at, opts: eye(0) })).toBe("number");
    expect(typeof bus.send(ROOM, { cmd: "sound", at })).toBe("number");
    expect(bus.send(ROOM, { cmd: "surface", at })).toHaveProperty("material");
    expect(bus.send(ROOM, { cmd: "medium" })).toHaveProperty("speedOfSound");
    expect(bus.send(ROOM, { cmd: "radio", a: at, b: { x: 0, y: 0 } })).toHaveProperty("strength");
  });

  describe("flicking the light on", () => {
    it("does nothing until the tick, and then changes what the sensor reads", () => {
      /* The whole point of one bus with two verbs: the click is a post, so it
         lands between ticks and every sensor in a tick agrees about it. */
      const at = { x: 1000, y: 1400 };
      bus.send(ROOM, { cmd: "lamp", id: 0, on: false });
      const dark = bus.send(ROOM, { cmd: "light", at, opts: eye(0) });

      bus.post(ROOM, { cmd: "lamp", id: 0, on: true });
      expect(bus.send(ROOM, { cmd: "light", at, opts: eye(0) })).toBe(dark);   // not yet

      room.tick();
      expect(bus.send(ROOM, { cmd: "light", at, opts: eye(0) })).toBeGreaterThan(dark);
    });

    it("toggles when nobody says which way", () => {
      expect(bus.send(ROOM, { cmd: "lamp", id: 0 })).toBe(false);
      expect(bus.send(ROOM, { cmd: "lamp", id: 0 })).toBe(true);
    });

    it("shows up in the snapshot, so the UI never has to remember", () => {
      bus.send(ROOM, { cmd: "lamp", id: 0, on: false });
      expect(room.snapshot().lamps[0].on).toBe(false);
      bus.send(ROOM, { cmd: "lamp", id: 0, on: true });
      expect(room.snapshot().lamps[0].on).toBe(true);
    });
  });

  describe("a human with a mouse", () => {
    it("moves a robot to where the hand let go", () => {
      const id = bus.send(ROOM, { cmd: "add" });
      bus.post(ROOM, { cmd: "place", id, x: 400, y: 1500 });   // clear floor
      room.tick();
      const b = room.bodies()[0];
      expect(b.x).toBeCloseTo(400, 3);
      expect(b.y).toBeCloseTo(1500, 3);
    });

    it("shoves a robot back out if the hand drops it inside the table", () => {
      /* matter.js owns this, and it is the right answer: a child who drops
         a robot on the furniture gets it back beside the furniture rather
         than half inside it. */
      const id = bus.send(ROOM, { cmd: "add" });
      const table = room.env().scene.furniture.find(f => f.name === "table");
      bus.post(ROOM, { cmd: "place", id, x: table.x + table.w / 2, y: table.y + table.h / 2 });
      for (let i = 0; i < 40; i++) room.tick();
      const b = room.bodies()[0];
      const inside = b.x > table.x && b.x < table.x + table.w &&
                     b.y > table.y && b.y < table.y + table.h;
      expect(inside).toBe(false);
    });

    it("collapses a whole drag into one move", () => {
      const id = bus.send(ROOM, { cmd: "add" });
      for (let i = 0; i < 60; i++) {
        bus.post(ROOM, { cmd: "place", id, x: 500 + i, y: 500 }, { coalesce: "place:" + id });
      }
      expect(bus.pending()).toBe(1);
      const out = room.tick();
      expect(out.delivered).toBe(1);
      expect(room.bodies()[0].x).toBe(559);
    });

    it("stops the wheels while it is being held, and lets go again", () => {
      const id = bus.send(ROOM, { cmd: "add" });
      bus.send(ROOM, { cmd: "place", id, x: 400, y: 1500 });
      bus.send(ROOM, { cmd: "drive", id, left: 100, right: 100 });

      bus.post(ROOM, { cmd: "hold", id });
      room.tick();
      const held = room.bodies()[0];
      expect(held.held).toBe(true);
      for (let i = 0; i < 10; i++) room.tick();
      expect(room.bodies()[0].x).toBeCloseTo(held.x, 6);   // the hand has it

      bus.post(ROOM, { cmd: "drop", id });
      for (let i = 0; i < 10; i++) room.tick();
      const free = room.bodies()[0];
      expect(free.held).toBe(false);
      expect(free.x).toBeGreaterThan(held.x + 5);          // driving again
    });

    it("lets a robot picked up and put down block another robot's sonar", () => {
      const a = bus.send(ROOM, { cmd: "add" });
      const b = bus.send(ROOM, { cmd: "add" });
      bus.post(ROOM, { cmd: "place", id: b, x: 1000, y: 700 });
      bus.post(ROOM, { cmd: "place", id: a, x: 1000, y: 1500 });
      room.tick();
      const from = { x: 1000, y: 1500 };
      expect(bus.send(ROOM, { cmd: "ray", from, angle: -Math.PI / 2, opts: { self: a } }))
        .toBeCloseTo(738, -1);
    });
  });

  it("carries on when a mouse message is nonsense, and keeps a note of it", () => {
    bus.post(ROOM, { cmd: "nonsense" });
    bus.post(ROOM, { cmd: "lamp", id: 0, on: false });
    const out = room.tick();
    expect(out.failed).toHaveLength(1);
    expect(out.delivered).toBe(1);                       // the good one still went through
    expect(room.snapshot().lamps[0].on).toBe(false);
    expect(room.problems()[0].what).toBe("failed");
  });

  it("notices a message sent to nobody", () => {
    bus.post("nowhere", { cmd: "place" });
    room.tick();
    expect(room.problems()[0].what).toBe("nobody took it");
  });

  it("moves the clock on by one step a tick", () => {
    const was = room.snapshot().t;
    room.tick(); room.tick();
    expect(room.snapshot().t).toBe(was + 10);
  });

  it("hands out a snapshot that is plain data", () => {
    bus.send(ROOM, { cmd: "add" });
    const snap = room.snapshot();
    expect(() => JSON.parse(JSON.stringify(snap))).not.toThrow();
    expect(snap.bodies[0]).toHaveProperty("id");
  });

  it("starts from the same seed every time a scene opens, so a run repeats", () => {
    const a = createRoom({ bus: createBus(), scene: "classroom", seed: 7 });
    const b = createRoom({ bus: createBus(), scene: "classroom", seed: 7 });
    expect(a.snapshot().seed).toBe(7);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it("clears the robots out when a new scene opens", () => {
    bus.send(ROOM, { cmd: "add" });
    expect(room.bodies()).toHaveLength(1);
    bus.send(ROOM, { cmd: "scene", name: "outdoor" });
    expect(room.bodies()).toHaveLength(0);
    expect(room.env().name).toBe("Playground");
  });

  it("lets a board beep and be heard by its neighbour", () => {
    const a = bus.send(ROOM, { cmd: "add" });
    const b = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id: a, x: 1000, y: 1000 });
    bus.send(ROOM, { cmd: "place", id: b, x: 1100, y: 1000 });
    const quiet = bus.send(ROOM, { cmd: "sound", at: { x: 1100, y: 1000 }, opts: { self: b } });
    bus.send(ROOM, { cmd: "beep", id: a });
    room.tick();
    const loud = bus.send(ROOM, { cmd: "sound", at: { x: 1100, y: 1000 }, opts: { self: b } });
    expect(quiet).toBe(0);
    expect(loud).toBeGreaterThan(0);
  });

  /* A robot's card is drawn from its READINGS and nothing else. It never
     looks at where the robot is - it does not have to, because anything that
     changes where the probes land changes what they come back with. These
     tests are that promise, from both ends. */
  describe("what a robot's card is drawn from", () => {
    const readsOf = (snap, id) => snap.bodies.find(b => b.id === id).reads;

    it("puts the readings in the snapshot, beside the body", () => {
      const id = bus.send(ROOM, { cmd: "add" });
      room.tick();
      const r = readsOf(room.snapshot(), id);
      expect(Object.keys(r).sort()).toEqual([
        /* the board's half */
        "buttonA", "buttonB", "compass", "light", "logo", "magnet",
        /* and the chassis's */
        "lightL", "lightR", "lineL", "lineR", "sonar", "sound"
      ].sort());
    });

    it("changes them when the robot moves, because its probes moved", () => {
      const id = bus.send(ROOM, { cmd: "add" });
      bus.send(ROOM, { cmd: "place", id: id, x: 300, y: 300 });
      room.tick();
      const corner = readsOf(room.snapshot(), id);
      bus.send(ROOM, { cmd: "place", id: id, x: 1000, y: 1000 });
      room.tick();
      const middle = readsOf(room.snapshot(), id);
      expect(middle.sonar).not.toBe(corner.sonar);
      expect(middle.lightL).not.toBe(corner.lightL);
    });

    it("changes them when a lamp goes off and the robot has not moved at all", () => {
      /* the point of the whole arrangement: nothing moved, so nothing told
         the card to redraw - the readings simply came back different */
      const id = bus.send(ROOM, { cmd: "add" });
      room.tick();
      const lit = readsOf(room.snapshot(), id);
      bus.send(ROOM, { cmd: "lamp", id: 0, on: false });
      room.tick();
      const dark = readsOf(room.snapshot(), id);
      expect(dark.lightL).toBeLessThan(lit.lightL);
      expect(dark.sonar).toBe(lit.sonar);        // geometry did not change
    });

    it("changes them when somebody else starts beeping", () => {
      const a = bus.send(ROOM, { cmd: "add" });
      const b = bus.send(ROOM, { cmd: "add" });
      bus.send(ROOM, { cmd: "place", id: a, x: 1000, y: 1000 });
      bus.send(ROOM, { cmd: "place", id: b, x: 1200, y: 1000 });
      room.tick();
      const quiet = readsOf(room.snapshot(), b).sound;
      bus.send(ROOM, { cmd: "beep", id: a });
      room.tick();
      expect(readsOf(room.snapshot(), b).sound).toBeGreaterThan(quiet);
    });

    it("hands over the physical quantities too, beside the block numbers", () => {
      /* so a lesson can show both: the room gives 2.8 units of light, your
         sensor says 540 */
      const id = bus.send(ROOM, { cmd: "add" });
      room.tick();
      const body = room.snapshot().bodies.find(x => x.id === id);
      expect(body.senses.lightL).toBeGreaterThan(0);
      expect(body.senses.lightL).not.toBe(body.reads.lightL);
    });
  });
});
