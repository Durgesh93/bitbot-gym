/* Changing the room while it is running.

   The point of these is not that a chair appears - it is that the FIELDS
   notice. A room where you can add a table that casts no shadow and blocks
   no sonar is a drawing, and the gym would be lying to every sensor on it.
   So each one here puts something in the room and then asks a field, not
   the furniture list. */

import { describe, it, expect, beforeEach } from "vitest";
import { createRoom, ROOM } from "../../src/app/room.js";
import { createBus } from "../../src/core/bus.js";

describe("editing a room while it runs", () => {
  let bus, room, env;
  beforeEach(() => {
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 7 });
    env = room.env || null;
  });

  it("offers the whole catalogue to choose from", () => {
    const names = bus.send(ROOM, { cmd: "catalogue" });
    expect(names).toContain("table");
    expect(names).toContain("chair");
    expect(names).toContain("plant");
    expect(names.length).toBeGreaterThan(20);
  });

  it("a thing added where a ray was clear now stops that ray", () => {
    const from = { x: 300, y: 300 };
    /* raycast answers with the distance itself, not an object about it */
    const before = bus.send(ROOM, { cmd: "ray", from, angle: 0, opts: {} });
    /* straight ahead along +x, so a wall put at x=900 must be hit */
    bus.send(ROOM, { cmd: "thing", name: "wall", x: 900, y: 240 });
    const after = bus.send(ROOM, { cmd: "ray", from, angle: 0, opts: {} });
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(500);
    expect(after).toBeLessThan(700);
  });

  it("a thing taken away gives the ray its distance back", () => {
    const from = { x: 300, y: 300 };
    const clear = bus.send(ROOM, { cmd: "ray", from, angle: 0, opts: {} });
    bus.send(ROOM, { cmd: "thing", name: "wall", x: 900, y: 240 });
    expect(bus.send(ROOM, { cmd: "ray", from, angle: 0, opts: {} })).toBeLessThan(clear);
    bus.send(ROOM, { cmd: "unthing", x: 950, y: 270 });
    expect(bus.send(ROOM, { cmd: "ray", from, angle: 0, opts: {} })).toBeCloseTo(clear, 5);
  });

  it("refuses a name it does not have, rather than inventing furniture", () => {
    expect(bus.send(ROOM, { cmd: "thing", name: "spaceship", x: 500, y: 500 })).toBe(null);
  });

  it("furnishing puts things in, and the same seed puts them in the same places", () => {
    const a = createRoom({ bus: createBus(), scene: "classroom", seed: 7 });
    const b = createRoom({ bus: createBus(), scene: "classroom", seed: 7 });
    a.bus.send(ROOM, { cmd: "furnish", count: 8, seed: 99 });
    b.bus.send(ROOM, { cmd: "furnish", count: 8, seed: 99 });
    const pos = r => r.snapshot().furniture.map(f => f.name + "@" + Math.round(f.x) + "," + Math.round(f.y));
    expect(pos(a)).toEqual(pos(b));
    expect(a.snapshot().furniture.length)
      .toBeGreaterThan(room.snapshot().furniture.length);
  });

  it("emptying the room clears the floor but never the lamps", () => {
    const lamps = room.snapshot().lamps.length;
    expect(room.snapshot().furniture.length).toBeGreaterThan(0);
    const gone = bus.send(ROOM, { cmd: "empty" });
    expect(gone).toBeGreaterThan(0);
    expect(room.snapshot().furniture).toEqual([]);
    expect(room.snapshot().lamps.length).toBe(lamps);
  });

  it("an emptied room really is clear to a ray, not just to the eye", () => {
    bus.send(ROOM, { cmd: "empty" });
    const hit = bus.send(ROOM, { cmd: "ray", from: { x: 100, y: 1200 }, angle: 0, opts: {} });
    /* nothing left but the walls, so the ray should cross the whole room */
    expect(hit).toBeGreaterThan(room.snapshot().size - 200);
  });

  it("tape drawn on the floor is dark to the surface field, and tape erased is not", () => {
    const p = { x: 800, y: 800 };
    expect(bus.send(ROOM, { cmd: "surface", at: p }).dark).toBe(false);
    bus.send(ROOM, { cmd: "line", from: { x: 400, y: 800 }, to: { x: 1200, y: 800 }, width: 30 });
    expect(bus.send(ROOM, { cmd: "surface", at: p }).dark).toBe(true);
    bus.send(ROOM, { cmd: "erase", x: 800, y: 800 });
    expect(bus.send(ROOM, { cmd: "surface", at: p }).dark).toBe(false);
  });

  it("erasing somewhere else leaves the tape alone", () => {
    bus.send(ROOM, { cmd: "line", from: { x: 400, y: 800 }, to: { x: 1200, y: 800 } });
    expect(bus.send(ROOM, { cmd: "erase", x: 800, y: 1500 })).toBe(0);
    expect(bus.send(ROOM, { cmd: "surface", at: { x: 800, y: 800 } }).dark).toBe(true);
  });

  it("clearing the floor takes every line at once", () => {
    bus.send(ROOM, { cmd: "line", from: { x: 400, y: 700 }, to: { x: 1200, y: 700 } });
    bus.send(ROOM, { cmd: "line", from: { x: 400, y: 900 }, to: { x: 1200, y: 900 } });
    expect(bus.send(ROOM, { cmd: "clearFloor" })).toBe(2);
    expect(bus.send(ROOM, { cmd: "surface", at: { x: 800, y: 700 } }).dark).toBe(false);
    expect(bus.send(ROOM, { cmd: "surface", at: { x: 800, y: 900 } }).dark).toBe(false);
  });

  it("put the robot back puts it where the scene says a robot starts", () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 1900, y: 1900 });
    room.tick();
    expect(room.snapshot().bodies[0].x).toBeCloseTo(1900, 0);
    bus.send(ROOM, { cmd: "home" });
    room.tick();
    const b = room.snapshot().bodies[0];
    expect(Math.hypot(b.x - 1900, b.y - 1900)).toBeGreaterThan(200);
  });

  it("a light sensor sees the shadow of a thing that was not there a tick ago", () => {
    const lamp = room.snapshot().lamps[0];
    /* BEHIND the board, and it has to really be behind it. A 900 mm board
       under a 2500 mm ceiling panel throws a shadow only about half its own
       distance past itself - similar triangles - so this spot used to sit
       in the open just beyond the end of it and the test passed on the old
       model by luck. Measured: the direct reading was identical with the
       board there and not there. */
    const spot = { x: 550, y: lamp.y };          // clear floor, west of the lamp
    const open = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0 } });
    const openDirect = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0, bounce: false } });
    bus.send(ROOM, { cmd: "thing", name: "whiteboard", x: 700, y: lamp.y,
                     rot: Math.PI / 2, centred: true });
    const shaded = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0 } });
    const shadedDirect = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0, bounce: false } });

    /* the lamp really is blocked now */
    expect(shadedDirect).toBeLessThan(openDirect * 0.5);
    /* and the reading a sensor takes drops with it, even though a white
       board is the most reflective thing in the catalogue and throws some
       of what it catches back in */
    expect(shaded).toBeLessThan(open);
  });
});

/* Moving, turning, copying and taking away ONE named thing.

   The id is the whole reason these exist. "Whatever is under the pointer"
   is enough to drop a chair in or take one out, and hopeless for a drag:
   the moment the mouse runs ahead of the chair, the next move would grab
   the table behind it. So the pointer learns a thing's id when it presses
   and keeps talking about that id until it lets go. */
describe("picking up one thing and moving it", () => {
  let bus, room;
  const ray = (from, angle) => bus.send(ROOM, { cmd: "ray", from, angle, opts: {} });
  beforeEach(() => {
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 7 });
  });

  it("gives every thing in the room an id of its own", () => {
    const ids = room.snapshot().furniture.map(f => f.uid);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(u => typeof u === "number")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens the same scene with the same ids, so a run still repeats", () => {
    const first = room.snapshot().furniture.map(f => f.uid);
    bus.send(ROOM, { cmd: "scene", name: "classroom" });
    expect(room.snapshot().furniture.map(f => f.uid)).toEqual(first);
  });

  it("moves the thing it was told to and not the one under the pointer", () => {
    const a = bus.send(ROOM, { cmd: "thing", name: "wall", x: 900, y: 240 });
    const b = bus.send(ROOM, { cmd: "thing", name: "wall", x: 900, y: 600 });
    bus.send(ROOM, { cmd: "moveThing", uid: a.uid, x: 1500, y: 240 });
    expect(room.snapshot().furniture.find(f => f.uid === a.uid).x).toBe(1500);
    expect(room.snapshot().furniture.find(f => f.uid === b.uid).x).toBe(900);
  });

  it("a thing dragged out of the way lets the ray through again", () => {
    const from = { x: 300, y: 300 };
    const clear = ray(from, 0);
    const w = bus.send(ROOM, { cmd: "thing", name: "wall", x: 900, y: 240 });
    expect(ray(from, 0)).toBeLessThan(clear);
    bus.send(ROOM, { cmd: "moveThing", uid: w.uid, x: 900, y: 1800 });
    expect(ray(from, 0)).toBeCloseTo(clear, 0);
  });

  it("turning a long thing side-on changes what the sonar finds", () => {
    const from = { x: 300, y: 300 };
    /* a wall is long and thin: end-on it is a sliver, broadside a barrier */
    const w = bus.send(ROOM, { cmd: "thing", name: "wall", x: 820, y: 290 });
    const broadside = ray(from, 0);
    bus.send(ROOM, { cmd: "turnThing", uid: w.uid, rot: Math.PI / 2 });
    const endOn = ray(from, 0);
    expect(endOn).not.toBeCloseTo(broadside, 0);
  });

  it("a copy is a second thing, in a second place, with an id of its own", () => {
    const a = bus.send(ROOM, { cmd: "thing", name: "chair", x: 600, y: 600 });
    const twin = bus.send(ROOM, { cmd: "copyThing", uid: a.uid });
    expect(twin.uid).not.toBe(a.uid);
    expect(twin.name).toBe("chair");
    expect(twin.x).toBeGreaterThan(a.x);
    const here = room.snapshot().furniture.filter(f => f.name === "chair");
    expect(here.filter(f => f.uid === a.uid || f.uid === twin.uid).length).toBe(2);
  });

  it("taking one away by its id clears the ray it was blocking", () => {
    const from = { x: 300, y: 300 };
    const clear = ray(from, 0);
    const w = bus.send(ROOM, { cmd: "thing", name: "wall", x: 900, y: 240 });
    expect(ray(from, 0)).toBeLessThan(clear);
    bus.send(ROOM, { cmd: "dropThing", uid: w.uid });
    expect(ray(from, 0)).toBeCloseTo(clear, 0);
  });

  it("a lamp taken out of the room takes its light with it", () => {
    const lamps = room.snapshot().lamps;
    expect(lamps.length).toBeGreaterThan(0);
    const under = { x: lamps[0].x, y: lamps[0].y };
    const lit = bus.send(ROOM, { cmd: "light", at: under, opts: { z: 0 } });
    bus.send(ROOM, { cmd: "dropLamp", id: 0 });
    const dimmer = bus.send(ROOM, { cmd: "light", at: under, opts: { z: 0 } });
    expect(room.snapshot().lamps.length).toBe(lamps.length - 1);
    expect(dimmer).toBeLessThan(lit);
  });

  it("a lamp put into the room lights the patch it stands on", () => {
    const spot = { x: 400, y: 1500 };
    const before = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0 } });
    const n = room.snapshot().lamps.length;
    bus.send(ROOM, { cmd: "addLamp", x: spot.x, y: spot.y });
    const after = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0 } });
    expect(room.snapshot().lamps.length).toBe(n + 1);
    expect(after).toBeGreaterThan(before);
  });

  it("two lamps either side of a table throw their shadows opposite ways", () => {
    /* The thing the teacher asked for by eye, asserted by number: a table
       between two lamps is dark on the far side of EACH of them, and the
       two dark sides are on opposite sides of the table. */
    bus.send(ROOM, { cmd: "empty" });
    for (let i = room.snapshot().lamps.length - 1; i >= 0; i--)
      bus.send(ROOM, { cmd: "dropLamp", id: i });
    const mid = 1000;
    bus.send(ROOM, { cmd: "thing", name: "table", x: mid, y: mid, centred: true });
    const t = bus.send(ROOM, { cmd: "whatAt", x: mid, y: mid });
    expect(t).toBeTruthy();
    const reach = t.w / 2 + 260;
    bus.send(ROOM, { cmd: "addLamp", x: mid - reach, y: mid });   // west of it
    const westOnly = {
      west: bus.send(ROOM, { cmd: "light", at: { x: mid - reach + 60, y: mid }, opts: { z: 0 } }),
      east: bus.send(ROOM, { cmd: "light", at: { x: mid + reach - 60, y: mid }, opts: { z: 0 } })
    };
    /* one lamp in the west: the east side of the table is its shadow */
    expect(westOnly.west).toBeGreaterThan(westOnly.east);

    bus.send(ROOM, { cmd: "addLamp", x: mid + reach, y: mid });   // and one east
    const both = {
      west: bus.send(ROOM, { cmd: "light", at: { x: mid - reach + 60, y: mid }, opts: { z: 0 } }),
      east: bus.send(ROOM, { cmd: "light", at: { x: mid + reach - 60, y: mid }, opts: { z: 0 } })
    };
    /* the second lamp lights the side the first one could not reach */
    expect(both.east).toBeGreaterThan(westOnly.east);
    /* and with one lamp each side the two sides end up alike */
    expect(Math.abs(both.west - both.east)).toBeLessThan(both.west * 0.25);
  });

  it("a second thing from the Room menu does not land on the first", () => {
    /* Everything the Room menu adds is aimed at the middle of the room, so
       a lamp and then a speaker arrived on the same square millimetre: the
       box swallowed the lamp, the room went dark because the lamp was now
       shining from inside it, and the lamp could never be picked up again
       because the pointer finds the box first. */
    const mid = room.snapshot().size / 2;
    bus.send(ROOM, { cmd: "empty" });
    bus.send(ROOM, { cmd: "addLamp", x: mid, y: mid });
    bus.send(ROOM, { cmd: "addSpeaker", x: mid, y: mid });
    const lamp = room.snapshot().lamps[room.snapshot().lamps.length - 1];
    const box = room.snapshot().furniture[room.snapshot().furniture.length - 1];
    const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    expect(Math.hypot(centre.x - lamp.x, centre.y - lamp.y))
      .toBeGreaterThan(Math.max(box.w, box.h) / 2);
    /* and the lamp is still where a hand can find it */
    expect(bus.send(ROOM, { cmd: "whatAt", x: lamp.x, y: lamp.y })).toBeFalsy();
  });

  it("two lamps from the Room menu do not land on each other", () => {
    const mid = room.snapshot().size / 2;
    bus.send(ROOM, { cmd: "empty" });
    bus.send(ROOM, { cmd: "addLamp", x: mid, y: mid });
    bus.send(ROOM, { cmd: "addLamp", x: mid, y: mid });
    const L = room.snapshot().lamps;
    const a = L[L.length - 2], b = L[L.length - 1];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100);
  });

  it("magnets from the Room menu do not land on each other or on a lamp", () => {
    const mid = room.snapshot().size / 2;
    bus.send(ROOM, { cmd: "empty" });
    bus.send(ROOM, { cmd: "addLamp", x: mid, y: mid });
    bus.send(ROOM, { cmd: "addMagnet", x: mid, y: mid });
    bus.send(ROOM, { cmd: "addMagnet", x: mid, y: mid });
    const snap = room.snapshot();
    const L = snap.lamps[snap.lamps.length - 1];
    const a = snap.magnets[0], b = snap.magnets[1];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100);
    expect(Math.hypot(a.x - L.x, a.y - L.y)).toBeGreaterThan(100);
    expect(Math.hypot(b.x - L.x, b.y - L.y)).toBeGreaterThan(100);
  });

  it("a magnet is still happy to sit under the table", () => {
    /* it dodges the other Room-menu things, but NOT furniture: a magnet
       works straight through a table top and hiding one under there is
       the whole trick */
    const f = room.snapshot().furniture[0];
    const mid = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
    bus.send(ROOM, { cmd: "addMagnet", x: mid.x, y: mid.y });
    const M = room.snapshot().magnets[0];
    expect(Math.hypot(M.x - mid.x, M.y - mid.y)).toBeLessThan(1);
  });

  it("a speaker put into the room can be heard from across it", () => {
    const spot = { x: 1600, y: 1600 };
    const quiet = bus.send(ROOM, { cmd: "sound", at: spot });
    const uid = bus.send(ROOM, { cmd: "addSpeaker", x: 400, y: 400 });
    expect(uid).toBeTruthy();
    const loud = bus.send(ROOM, { cmd: "sound", at: spot });
    expect(loud).toBeGreaterThan(quiet);
    /* and it is a thing in the room as well as a noise: you can pick it up */
    expect(bus.send(ROOM, { cmd: "whatAt", x: 400, y: 400 })).toBeTruthy();
  });

  it("a lamp dragged away takes the bright patch under it along", () => {
    const L = room.snapshot().lamps[0];
    const under = { x: L.x, y: L.y };
    const lit = bus.send(ROOM, { cmd: "light", at: under, opts: { z: 0 } });
    /* right across the room, so this spot is now the far one from it */
    bus.send(ROOM, { cmd: "moveLamp", id: 0, x: 150, y: 150 });
    const dimmer = bus.send(ROOM, { cmd: "light", at: under, opts: { z: 0 } });
    expect(room.snapshot().lamps[0].x).toBe(150);
    expect(dimmer).toBeLessThan(lit);
  });
});

/* The two kinds of thing a child can put in the room. */
describe("a micro:bit on its own and a micro:bit on a Bit:Bot", () => {
  let bus, room;
  beforeEach(() => {
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 7 });
  });

  const of = id => room.snapshot().bodies.find(b => b.id === id);

  it("names Bit:Bots by number and bare boards by letter", () => {
    const a = bus.send(ROOM, { cmd: "add" });
    const b = bus.send(ROOM, { cmd: "add" });
    const c = bus.send(ROOM, { cmd: "add", kind: "microbit" });
    room.tick();
    expect(of(a).program.name).toBe("Bit:Bot 1");
    expect(of(b).program.name).toBe("Bit:Bot 2");
    expect(of(c).program.name).toBe("micro:bit A");
  });

  it("puts a bare board in the room smaller than a whole robot", () => {
    const bot = bus.send(ROOM, { cmd: "add" });
    const bare = bus.send(ROOM, { cmd: "add", kind: "microbit" });
    room.tick();
    expect(of(bare).r).toBeLessThan(of(bot).r);
    expect(of(bare).program.plugged).toBe(false);
    expect(of(bot).program.plugged).toBe(true);
  });

  it("shrinks the thing in the room when the board comes off the chassis", () => {
    const id = bus.send(ROOM, { cmd: "add" });
    room.tick();
    const whole = of(id).r;
    bus.send(ROOM, { cmd: "plug", id, on: false });
    room.tick();
    expect(of(id).r).toBeLessThan(whole);
    expect(of(id).program.kind).toBe("microbit");
    bus.send(ROOM, { cmd: "plug", id, on: true });
    room.tick();
    expect(of(id).r).toBeCloseTo(whole, 1);
  });

  it("takes a new name, but will not take one that is already in use", () => {
    const a = bus.send(ROOM, { cmd: "add" });
    const b = bus.send(ROOM, { cmd: "add" });
    room.tick();
    expect(bus.send(ROOM, { cmd: "rename", id: a, name: "Dasher" })).toBe("Dasher");
    room.tick();
    expect(of(a).program.name).toBe("Dasher");
    /* the second one asking for the same name keeps the one it had */
    expect(bus.send(ROOM, { cmd: "rename", id: b, name: "Dasher" })).toBe("Bit:Bot 2");
    expect(bus.send(ROOM, { cmd: "rename", id: b, name: "   " })).toBe("Bit:Bot 2");
  });

  it("copies a board as a second empty one beside it, code and all left behind", () => {
    const a = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id: a, code: "basic.showNumber(1)" });
    const b = bus.send(ROOM, { cmd: "copy", id: a });
    room.tick();
    expect(b).not.toBe(a);
    expect(of(b).program.name).toBe("Bit:Bot 2");
    expect(room.machine(b).code()).toBe("");
  });
});

/* Where a new one lands. */
describe("putting a fourth, fifth and sixth board in a room with three spots", () => {
  let bus, room;
  beforeEach(() => {
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 7 });
  });

  it("never stands one on top of another, however many are added", () => {
    const ids = [];
    for (let i = 0; i < 8; i++) ids.push(bus.send(ROOM, { cmd: "add" }));
    room.tick();
    const b = room.snapshot().bodies;
    expect(b.length).toBe(8);
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        /* touching is a collision the physics would have to shove apart,
           and a child would see one robot where there are two */
        expect(Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y))
          .toBeGreaterThan(b[i].r + b[j].r);
      }
    }
  });

  it("keeps them all inside the room", () => {
    for (let i = 0; i < 8; i++) bus.send(ROOM, { cmd: "add" });
    room.tick();
    const size = room.snapshot().size;
    for (const b of room.snapshot().bodies) {
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(size);
      expect(b.y).toBeLessThan(size);
    }
  });
});

/* The settings a class sets once, after measuring their own robot. */
describe("robot settings", () => {
  let bus, room;
  beforeEach(() => {
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 7 });
    bus.send(ROOM, { cmd: "tune", top: 450, dead: 15, mismatch: 3, grip: 0.3, lightUp: true });
  });

  it("hands back everything it can be set to", () => {
    const t = bus.send(ROOM, { cmd: "tuning" });
    expect(Object.keys(t).sort())
      .toEqual(["battery", "dead", "grip", "lightUp", "mismatch", "top"]);
  });

  it("a slower top speed really does drive the robot less far", async () => {
    const run = async (top) => {
      bus = createBus();
      room = createRoom({ bus, scene: "classroom", seed: 7 });
      bus.send(ROOM, { cmd: "tune", top, dead: 15, mismatch: 3 });
      const id = bus.send(ROOM, { cmd: "add" });
      bus.send(ROOM, { cmd: "place", id, x: 1000, y: 1000, heading: 0 });
      room.tick();
      const from = room.snapshot().bodies[0];
      bus.send(ROOM, { cmd: "drive", id, left: 100, right: 100 });
      for (let i = 0; i < 300; i++) room.tick();
      const to = room.snapshot().bodies[0];
      return Math.hypot(to.x - from.x, to.y - from.y);
    };
    const slow = await run(200), fast = await run(800);
    expect(fast).toBeGreaterThan(slow * 1.5);
  });

  it("a flat battery is a slower robot than a fresh one", () => {
    const id = bus.send(ROOM, { cmd: "add" });
    room.tick();
    bus.send(ROOM, { cmd: "tune", battery: 100 });
    expect(bus.send(ROOM, { cmd: "tuning" }).battery).toBe(100);
    bus.send(ROOM, { cmd: "tune", battery: 20 });
    expect(bus.send(ROOM, { cmd: "tuning" }).battery).toBe(20);
  });

  it("turns the light sensors round, so a bright eye reads low instead", () => {
    const id = bus.send(ROOM, { cmd: "add" });
    room.tick();
    const up = room.snapshot().bodies[0].reads.lightL;
    bus.send(ROOM, { cmd: "tune", lightUp: false });
    room.tick();
    const down = room.snapshot().bodies[0].reads.lightL;
    expect(up + down).toBeCloseTo(1023, 0);
    bus.send(ROOM, { cmd: "tune", lightUp: true });
  });

  it("remembers the grip it was given", () => {
    bus.send(ROOM, { cmd: "tune", grip: 0.8 });
    expect(bus.send(ROOM, { cmd: "tuning" }).grip).toBeCloseTo(0.8, 3);
    bus.send(ROOM, { cmd: "tune", grip: 0.3 });
  });
});
