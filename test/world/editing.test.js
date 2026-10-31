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
    /* stand just the other side of where the board is about to go */
    const spot = { x: lamp.x + 420, y: lamp.y };
    const lit = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0 } });
    bus.send(ROOM, { cmd: "thing", name: "whiteboard", x: lamp.x + 150, y: lamp.y - 310, rot: Math.PI / 2 });
    const shaded = bus.send(ROOM, { cmd: "light", at: spot, opts: { z: 0 } });
    expect(shaded).toBeLessThan(lit);
  });
});
